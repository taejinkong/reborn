// 몬테카를로 보정: 국가마다 많은 삶을 자동으로 살려 보고, 시뮬레이션 결과가 통계와 같아지도록
// 사망 배수 평균·결혼 위험률 배수·출산 배수를 반복해서 고친다. 결과는 data/build/calibration.json.
//
//   node scripts/calibrate.ts [livesPerSex=1500] [iterations=4]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { MORT_BANDS, defaultCalibration, mortBand, type CalibrationFile, type CountryCalibration } from '../packages/engine/src/calibration.ts';
import { Life } from '../packages/engine/src/life.ts';
import type { Sex } from '../packages/engine/src/state.ts';
import { World } from '../packages/engine/src/world.ts';

const ROOT = join(import.meta.dirname, '..');
const FILES = {
  countries: join(ROOT, 'data/build/countries.json'),
  lifetable: join(ROOT, 'data/build/lifetables/2023.json'),
  content: join(ROOT, 'content/build/content.json'),
};
const OUT = join(ROOT, 'data/build/calibration.json');

interface Job { isos: string[]; n: number; iterations: number }
export interface CountryResult {
  iso: string;
  cal: CountryCalibration;
  check: { e0: Record<Sex, number>; e0Target: Record<Sex, number>; tfr: number; tfrTarget: number; married: Record<Sex, number>; marriedTarget: Record<Sex, number> };
}

/** 생명표로 계산한 출생 시 기대수명 */
function lifetableE0(q: number[]): number {
  let alive = 1, total = 0;
  for (const qx of q) {
    const d = alive * qx;
    total += alive - d + d * 0.5;
    alive -= d;
  }
  return total;
}

interface Sim {
  mortSum: Record<Sex, number[]>;
  mortN: Record<Sex, number[]>;
  births: number[];
  womanYears: number[];
  married: Record<Sex, [number, number]>;
  deathAge: Record<Sex, [number, number]>;
}

function simulate(world: World, iso: string, n: number, tag: string): Sim {
  const zeros = () => MORT_BANDS.map(() => 0);
  const s: Sim = {
    mortSum: { F: zeros(), M: zeros() }, mortN: { F: zeros(), M: zeros() },
    births: Array(50).fill(0), womanYears: Array(50).fill(0),
    married: { F: [0, 0], M: [0, 0] }, deathAge: { F: [0, 0], M: [0, 0] },
  };
  for (const sex of ['F', 'M'] as Sex[]) {
    for (let i = 0; i < n; i++) {
      const l = Life.born(world, { seed: `cal:${tag}:${iso}:${sex}:${i}`, country: iso, sex });
      l.observe = (o) => {
        const b = mortBand(o.age);
        s.mortSum[o.sex][b] += o.raw;
        s.mortN[o.sex][b]++;
      };
      while (l.alive) {
        const age = l.p.age;
        if (age === 47) {
          s.married[sex][0] += l.p.flags.everMarried ? 1 : 0;
          s.married[sex][1]++;
        }
        const kids = l.p.family.children.length;
        l.step({ autoFocus: true });
        if (l.p.pending) l.autoChoose();
        // 출생은 그 해 시작 나이의 여성에게 센다 (살아서 한 해를 다 보낸 경우만 노출로 친다)
        if (sex === 'F' && age >= 15 && age <= 49 && l.alive) {
          s.womanYears[age]++;
          s.births[age] += l.p.family.children.length - kids;
        }
      }
      s.deathAge[sex][0] += l.p.dead!.age + 0.5;
      s.deathAge[sex][1]++;
    }
  }
  return s;
}

const simTfr = (s: Sim) => s.births.reduce((t, b, a) => t + (s.womanYears[a] ? b / s.womanYears[a] : 0), 0);
const ratio = (x: [number, number]) => (x[1] ? x[0] / x[1] : NaN);
const clampR = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function calibrateCountry(world: World, iso: string, n: number, iterations: number): CountryResult {
  const c = world.country(iso);
  const cal = defaultCalibration();
  world.setCalibration(iso, cal);
  for (let it = 0; it < iterations; it++) {
    const s = simulate(world, iso, n, `it${it}`);
    for (const sex of ['F', 'M'] as Sex[]) {
      // 사망: 연령대별 보정 전 배수의 평균. 표본이 적은 구간은 이전 값을 유지한다
      s.mortN[sex].forEach((cnt, b) => { if (cnt >= 50) cal.mort[sex][b] = s.mortSum[sex][b] / cnt; });
      // 결혼: 누적 위험률 비율만큼 배수를 고친다
      const target = Math.min(c.everMarried[sex], 0.995);
      const got = clampR(ratio(s.married[sex]), 0.01, 0.995);
      if (Number.isFinite(got)) cal.union[sex] *= clampR(Math.log(1 - target) / Math.log(1 - got), 0.5, 3);
    }
    const tfr = simTfr(s);
    if (tfr > 0) cal.fert *= clampR(c.tfr / tfr, 0.5, 2);
    world.setCalibration(iso, cal);
  }
  // 검증: 보정에 쓰지 않은 시드로 다시 돌린다
  const v = simulate(world, iso, n, 'check');
  const lt = JSON.parse(readFileSync(FILES.lifetable, 'utf8')).q[iso];
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  cal.mort.F = cal.mort.F.map(r3); cal.mort.M = cal.mort.M.map(r3);
  cal.union = { F: r3(cal.union.F), M: r3(cal.union.M) };
  cal.fert = r3(cal.fert);
  return {
    iso,
    cal,
    check: {
      e0: { F: r1(ratio(v.deathAge.F)), M: r1(ratio(v.deathAge.M)) },
      e0Target: { F: r1(lifetableE0(lt.F)), M: r1(lifetableE0(lt.M)) },
      tfr: Math.round(simTfr(v) * 100) / 100,
      tfrTarget: c.tfr,
      married: { F: r3(ratio(v.married.F)), M: r3(ratio(v.married.M)) },
      marriedTarget: c.everMarried,
    },
  };
}

function loadWorld(): World {
  const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  return new World({ countries: json(FILES.countries), lifetable: json(FILES.lifetable), content: json(FILES.content) });
}

if (!isMainThread) {
  const { isos, n, iterations } = workerData as Job;
  const world = loadWorld();
  for (const iso of isos) parentPort!.postMessage(calibrateCountry(world, iso, n, iterations));
} else {
  const n = Number(process.argv[2] ?? 1500);
  const iterations = Number(process.argv[3] ?? 4);
  const world = loadWorld();
  // 큰 나라부터 고르게 나눠 작업자들이 비슷하게 끝나게 한다
  const isos = world.countries.map((c) => c.id);
  const threads = Math.min(availableParallelism(), isos.length);
  const buckets: string[][] = Array.from({ length: threads }, () => []);
  isos.forEach((iso, i) => buckets[i % threads].push(iso));

  const started = Date.now();
  const results: CountryResult[] = [];
  await Promise.all(buckets.map((b) => new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { isos: b, n, iterations } satisfies Job });
    w.on('message', (r: CountryResult) => {
      results.push(r);
      if (results.length % 20 === 0) console.log(`  ${results.length}/${isos.length}개국 (${Math.round((Date.now() - started) / 1000)}초)`);
    });
    w.on('error', reject);
    w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`작업자 종료 코드 ${code}`))));
  })));

  results.sort((a, b) => a.iso.localeCompare(b.iso));
  const hash = createHash('sha256');
  for (const f of Object.values(FILES)) hash.update(readFileSync(f));
  const file: CalibrationFile & { check: Record<string, CountryResult['check']> } = {
    generated: new Date().toISOString().slice(0, 10),
    contentHash: hash.digest('hex').slice(0, 16),
    livesPerSex: n,
    iterations,
    countries: Object.fromEntries(results.map((r) => [r.iso, r.cal])),
    check: Object.fromEntries(results.map((r) => [r.iso, r.check])),
  };
  writeFileSync(OUT, JSON.stringify(file) + '\n');

  // 요약: 통계와의 차이
  const err = (f: (r: CountryResult) => number) => {
    const xs = results.map(f).sort((a, b) => a - b);
    return { mean: xs.reduce((s, x) => s + x, 0) / xs.length, p90: xs[Math.floor(xs.length * 0.9)], max: xs[xs.length - 1] };
  };
  const fmt = (o: { mean: number; p90: number; max: number }, d = 2) => `평균 ${o.mean.toFixed(d)}, 90% ${o.p90.toFixed(d)}, 최대 ${o.max.toFixed(d)}`;
  console.log(`\n${results.length}개국 보정 완료 (${Math.round((Date.now() - started) / 1000)}초, 성별당 ${n}명 × ${iterations}회)`);
  console.log(`기대수명 차이(년)   ${fmt(err((r) => Math.max(Math.abs(r.check.e0.F - r.check.e0Target.F), Math.abs(r.check.e0.M - r.check.e0Target.M))))}`);
  console.log(`합계출산율 차이     ${fmt(err((r) => Math.abs(r.check.tfr - r.check.tfrTarget)))}`);
  console.log(`결혼 경험 차이(%p)  ${fmt(err((r) => 100 * Math.max(Math.abs(r.check.married.F - r.check.marriedTarget.F), Math.abs(r.check.married.M - r.check.marriedTarget.M))), 1)}`);
}
