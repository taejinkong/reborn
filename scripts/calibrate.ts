// 몬테카를로 보정: 국가마다 많은 삶을 자동으로 살려 보고, 시뮬레이션 결과가 통계와 같아지도록
// 보정 계수(calibration.ts의 CountryCalibration)를 반복해서 고친다. 결과는 data/build/calibration.json.
//
//   node scripts/calibrate.ts [livesPerSex=1500] [iterations=6]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { defaultCalibration, type CalibrationFile, type CauseGroup, type CountryCalibration } from '../packages/engine/src/calibration.ts';
import { toOdds } from '../packages/engine/src/math.ts';
import type { Sex } from '../packages/engine/src/state.ts';
import type { World } from '../packages/engine/src/world.ts';
import { CALIBRATION_FILE, INPUT_FILES, e0Of, lifetableE0, loadWorld, measureCountry, rate, tfrOf, type Measures } from './measure.ts';

interface Job { isos: string[]; n: number; iterations: number }

export interface Check {
  e0: Record<Sex, number>; e0Target: Record<Sex, number>;
  tfr: number; tfrTarget: number;
  married: Record<Sex, number>; marriedTarget: Record<Sex, number>;
  childMarriage: number; childMarriageTarget: number;
  divorced: number; divorcedTarget: number;
  lfp: Record<Sex, number>; lfpTarget: Record<Sex, number>;
  unemployment: number; unemploymentTarget: number;
  smoking: Record<Sex, number>; smokingTarget: Record<Sex, number>;
  diabetes: number; diabetesTarget: number;
  causes: Record<CauseGroup, number>; causesTarget: Record<CauseGroup, number>;
  abroad: number; abroadTarget: number;
  refugee: number; refugeeTarget: number;
}
interface CountryResult { iso: string; cal: CountryCalibration; check: Check }

const SEXES: Sex[] = ['F', 'M'];
const GROUPS: CauseGroup[] = ['comm', 'ncd', 'inj'];
const clampR = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const finite = (x: number, fallback = 1) => (Number.isFinite(x) && x > 0 ? x : fallback);
/** 누적 위험률 비율: 목표 비율을 만들려면 위험률을 얼마나 키워야 하나 */
const hazardRatio = (target: number, got: number) =>
  Math.log(1 - clampR(target, 0.001, 0.995)) / Math.log(1 - clampR(got, 0.001, 0.995));
/** 오즈 비율 */
const oddsRatio = (target: number, got: number) => toOdds(clampR(target, 0.01, 0.99)) / toOdds(clampR(got, 0.01, 0.99));

function update(world: World, iso: string, cal: CountryCalibration, m: Measures): void {
  const c = world.country(iso);
  for (const sex of SEXES) {
    // 사망: 연령대별 보정 전 배수의 평균. 표본이 적은 구간은 이전 값을 유지한다
    m.mortN[sex].forEach((cnt, b) => { if (cnt >= 50) cal.mort[sex][b] = m.mortSum[sex][b] / cnt; });
    cal.union[sex] *= clampR(finite(hazardRatio(c.everMarried[sex], rate(m.married47[sex]))), 0.5, 3);
    cal.lfp[sex] *= clampR(finite(oddsRatio(c.lfp[sex], rate(m.inLabor[sex]))), 0.3, 3);
    // 흡연율이 아주 낮은 나라는 비율 대신 작은 값으로 둔다
    cal.smoke[sex] *= c.smoking[sex] < 0.003 ? 1 : clampR(finite(c.smoking[sex] / rate(m.smoking[sex]), 2), 0.5, 2);
    cal.smoke[sex] = clampR(cal.smoke[sex], 0.05, 40);
  }
  const tfr = tfrOf(m);
  if (tfr > 0) cal.fert *= clampR(c.tfr / tfr, 0.5, 2);
  cal.childUnion *= c.childMarriage < 0.003 ? 0.5 : clampR(finite(hazardRatio(c.childMarriage, rate(m.childMarriage)), 2), 0.3, 3);
  cal.childUnion = clampR(cal.childUnion, 0.01, 20);
  const divTarget = c.divorced.F / 100;
  cal.divorce *= divTarget < 0.003 ? 0.5 : clampR(finite(divTarget / rate(m.divorced47.F), 2), 0.4, 2.5);
  cal.divorce = clampR(cal.divorce, 0.01, 30);
  // 실업률이 높게 나오면 구직 성공을 쉽게
  cal.find *= clampR(finite(oddsRatio(rate(m.unemployed), c.unemployment)), 0.3, 3);
  cal.find = clampR(cal.find, 0.002, 50);
  cal.diabetes *= clampR(finite(c.diabetesPrev / rate(m.diabetes), 2), 0.5, 2);
  // 사망 원인 3대 분류: 비중 비율만큼 가중치를 고친다
  for (const g of GROUPS) cal.cause[g] *= clampR(finite(c.deathShare[g] / (m.causes[g] / m.deaths), 2), 0.3, 3);
  const mean = GROUPS.reduce((s, g) => s + cal.cause[g], 0) / 3;
  for (const g of GROUPS) cal.cause[g] /= mean;
  // 국제 이주: 해외에서 보낸 해의 비율을 노동 이주분과 피란분으로 나눠 맞춘다
  const abroad = rate(m.abroad), refShare = rate(m.refugeeAbroad);
  const laborGot = abroad * (1 - (Number.isFinite(refShare) ? refShare : 0));
  const fleeGot = abroad * (Number.isFinite(refShare) ? refShare : 0);
  const laborWant = c.emigrantShare * (1 - c.refugeeShare), fleeWant = c.emigrantShare * c.refugeeShare;
  cal.emig = laborWant < 0.0005 ? 0.1 : clampR(cal.emig * clampR(finite(hazardRatio(laborWant, laborGot), 3), 0.3, 3), 0.01, 100);
  cal.flee = fleeWant < 0.0005 ? 0.1 : clampR(cal.flee * clampR(finite(hazardRatio(fleeWant, fleeGot), 3), 0.3, 3), 0.01, 100);
}

function calibrateCountry(world: World, iso: string, n: number, iterations: number): CountryResult {
  const c = world.country(iso);
  const cal = defaultCalibration();
  world.setCalibration(iso, cal);
  for (let it = 0; it < iterations; it++) {
    update(world, iso, cal, measureCountry(world, iso, n, `cal:it${it}`));
    world.setCalibration(iso, cal);
  }
  // 검증: 보정에 쓰지 않은 시드로 다시 돌린다
  const v = measureCountry(world, iso, n, 'cal:check');
  const lt = JSON.parse(readFileSync(INPUT_FILES.lifetable, 'utf8')).q[iso];
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const bySex = (f: (s: Sex) => number) => ({ F: f('F'), M: f('M') });
  const round = (cal: CountryCalibration): CountryCalibration => ({
    mort: { F: cal.mort.F.map(r3), M: cal.mort.M.map(r3) },
    union: bySex((s) => r3(cal.union[s])), fert: r3(cal.fert), childUnion: r3(cal.childUnion), divorce: r3(cal.divorce),
    lfp: bySex((s) => r3(cal.lfp[s])), find: r3(cal.find), smoke: bySex((s) => r3(cal.smoke[s])), diabetes: r3(cal.diabetes),
    cause: { comm: r3(cal.cause.comm), ncd: r3(cal.cause.ncd), inj: r3(cal.cause.inj) },
    emig: r3(cal.emig), flee: r3(cal.flee),
  });
  return {
    iso,
    cal: round(cal),
    check: {
      e0: bySex((s) => r1(e0Of(v, s))), e0Target: bySex((s) => r1(lifetableE0(lt[s]))),
      tfr: r3(tfrOf(v)), tfrTarget: c.tfr,
      married: bySex((s) => r3(rate(v.married47[s]))), marriedTarget: c.everMarried,
      childMarriage: r3(rate(v.childMarriage)), childMarriageTarget: c.childMarriage,
      divorced: r3(rate(v.divorced47.F)), divorcedTarget: r3(c.divorced.F / 100),
      lfp: bySex((s) => r3(rate(v.inLabor[s]))), lfpTarget: c.lfp,
      unemployment: r3(rate(v.unemployed)), unemploymentTarget: c.unemployment,
      smoking: bySex((s) => r3(rate(v.smoking[s]))), smokingTarget: c.smoking,
      diabetes: r3(rate(v.diabetes)), diabetesTarget: c.diabetesPrev,
      causes: { comm: r3(v.causes.comm / v.deaths), ncd: r3(v.causes.ncd / v.deaths), inj: r3(v.causes.inj / v.deaths) },
      causesTarget: { comm: r3(c.deathShare.comm), ncd: r3(c.deathShare.ncd), inj: r3(c.deathShare.inj) },
      abroad: r3(rate(v.abroad)), abroadTarget: c.emigrantShare,
      refugee: r3(rate(v.refugeeAbroad)), refugeeTarget: c.refugeeShare,
    },
  };
}

if (!isMainThread) {
  const { isos, n, iterations } = workerData as Job;
  const world = loadWorld(false);
  for (const iso of isos) parentPort!.postMessage(calibrateCountry(world, iso, n, iterations));
} else {
  const n = Number(process.argv[2] ?? 1500);
  const iterations = Number(process.argv[3] ?? 6);
  const world = loadWorld(false);
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
  for (const f of Object.values(INPUT_FILES)) hash.update(readFileSync(f));
  const file: CalibrationFile & { check: Record<string, Check> } = {
    generated: new Date().toISOString().slice(0, 10),
    contentHash: hash.digest('hex').slice(0, 16),
    livesPerSex: n,
    iterations,
    countries: Object.fromEntries(results.map((r) => [r.iso, r.cal])),
    check: Object.fromEntries(results.map((r) => [r.iso, r.check])),
  };
  writeFileSync(CALIBRATION_FILE, JSON.stringify(file) + '\n');

  // 요약: 통계와의 차이 (검증 시드)
  const stat = (f: (k: Check) => number) => {
    const xs = results.map((r) => f(r.check)).filter(Number.isFinite).sort((a, b) => a - b);
    return { mean: xs.reduce((s, x) => s + x, 0) / xs.length, p90: xs[Math.floor(xs.length * 0.9)], max: xs[xs.length - 1] };
  };
  const line = (label: string, f: (k: Check) => number, scale = 1, d = 2) => {
    const s = stat(f);
    console.log(`${label.padEnd(22)} 평균 ${(s.mean * scale).toFixed(d)}, 90% ${(s.p90 * scale).toFixed(d)}, 최대 ${(s.max * scale).toFixed(d)}`);
  };
  const maxSex = (f: (s: Sex) => number) => Math.max(Math.abs(f('F')), Math.abs(f('M')));
  console.log(`\n${results.length}개국 보정 완료 (${Math.round((Date.now() - started) / 1000)}초, 성별당 ${n}명 × ${iterations}회)`);
  line('기대수명 차이(년)', (k) => maxSex((s) => k.e0[s] - k.e0Target[s]), 1, 2);
  line('합계출산율 차이', (k) => Math.abs(k.tfr - k.tfrTarget));
  line('결혼 경험 차이(%p)', (k) => maxSex((s) => k.married[s] - k.marriedTarget[s]), 100, 1);
  line('조혼율 차이(%p)', (k) => Math.abs(k.childMarriage - k.childMarriageTarget), 100, 1);
  line('이혼·별거 차이(%p)', (k) => Math.abs(k.divorced - k.divorcedTarget), 100, 1);
  line('경제활동참가율 차이(%p)', (k) => maxSex((s) => k.lfp[s] - k.lfpTarget[s]), 100, 1);
  line('실업률 차이(%p)', (k) => Math.abs(k.unemployment - k.unemploymentTarget), 100, 1);
  line('흡연율 차이(%p)', (k) => maxSex((s) => k.smoking[s] - k.smokingTarget[s]), 100, 1);
  line('당뇨 유병률 차이(%p)', (k) => Math.abs(k.diabetes - k.diabetesTarget), 100, 1);
  line('해외 거주 비율 차이(%p)', (k) => Math.abs(k.abroad - k.abroadTarget), 100, 1);
  line('사망 원인 비중 차이(%p)', (k) => Math.max(...GROUPS.map((g) => Math.abs(k.causes[g] - k.causesTarget[g]))), 100, 1);
}
