// 모델 감사: 대표 국가에서 자동으로 삶을 살려 보고 시뮬레이션 결과를 실제 통계와 항목별로 비교한다.
// 보정(calibrate.ts)과 같은 측정 코드(measure.ts)를 쓰되, 보정에 쓰지 않은 시드로 센다.
// 결과는 docs/model-audit.md 로 저장한다.
//
//   node scripts/audit.ts [livesPerSex=1500]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { Country } from '../packages/engine/src/data.ts';
import { readFileSync } from 'node:fs';
import { INPUT_FILES, ROOT, e0Of, gini, lifetableE0, loadWorld, measureCountry, rate, tfrOf, type Measures } from './measure.ts';

const COUNTRIES = ['KOR', 'JPN', 'USA', 'FRA', 'DEU', 'RUS', 'BRA', 'MEX', 'CHN', 'IDN', 'IND', 'PAK', 'BGD', 'EGY', 'SAU', 'NGA', 'ETH', 'COD'];

if (!isMainThread) {
  const { iso, n } = workerData as { iso: string; n: number };
  parentPort!.postMessage({ iso, m: measureCountry(loadWorld(), iso, n, 'audit') });
} else {
  const n = Number(process.argv[2] ?? 1500);
  const world = loadWorld();
  if (!world.calibrationFile) console.warn('보정 파일이 없어 보정 없이 감사합니다 (npm run calibrate).');
  const results = new Map<string, Measures>();
  const queue = [...COUNTRIES];
  const runOne = (): Promise<void> => {
    const iso = queue.shift();
    if (!iso) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { iso, n } });
      w.on('message', (r: { iso: string; m: Measures }) => results.set(r.iso, r.m));
      w.on('error', reject);
      w.on('exit', () => resolve());
    }).then(runOne);
  };
  await Promise.all(Array.from({ length: 10 }, runOne));

  const pct = (x: number) => 100 * x;
  // 엔진이 쓰는 생명표(2023)의 기대수명과 비교한다
  const lt = JSON.parse(readFileSync(INPUT_FILES.lifetable, 'utf8')).q;
  const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
  type Row = { label: string; unit: string; tol: number; get: (m: Measures, c: Country) => [number, number] };
  const rows: Row[] = [
    { label: '기대수명 여성 (생명표 2023)', unit: '세', tol: 1, get: (m, c) => [e0Of(m, 'F'), lifetableE0(lt[c.id].F)] },
    { label: '기대수명 남성 (생명표 2023)', unit: '세', tol: 1, get: (m, c) => [e0Of(m, 'M'), lifetableE0(lt[c.id].M)] },
    { label: '합계출산율', unit: '명', tol: 0.2, get: (m, c) => [tfrOf(m), c.tfr] },
    { label: '45~49세 결혼 경험 여성', unit: '%', tol: 4, get: (m, c) => [pct(rate(m.married47.F)), pct(c.everMarried.F)] },
    { label: '45~49세 결혼 경험 남성', unit: '%', tol: 4, get: (m, c) => [pct(rate(m.married47.M)), pct(c.everMarried.M)] },
    { label: '18세 전 결혼 (여성)', unit: '%', tol: 4, get: (m, c) => [pct(rate(m.childMarriage)), pct(c.childMarriage)] },
    { label: '45~49세 이혼·별거 (여성)', unit: '%', tol: 3, get: (m, c) => [pct(rate(m.divorced47.F)), c.divorced.F] },
    { label: '도시 출생', unit: '%', tol: 5, get: (m, c) => [pct(rate(m.urban)), pct(c.urban)] },
    { label: '초등 입학 (7세)', unit: '%', tol: 5, get: (m, c) => [pct(rate(m.primary)), pct(c.primaryEnroll)] },
    { label: '중등 재학·졸업 (14세)', unit: '%', tol: 10, get: (m, c) => [pct(rate(m.secondary)), pct(c.secondaryEnroll)] },
    { label: '대학 진학 (23세) / 고등교육 총취학률*', unit: '%', tol: 15, get: (m, c) => [pct(rate(m.tertiary)), pct(c.tertiaryEnroll)] },
    { label: '경제활동참가율 여성 (15~64세)', unit: '%', tol: 5, get: (m, c) => [pct(rate(m.inLabor.F)), pct(c.lfp.F)] },
    { label: '경제활동참가율 남성 (15~64세)', unit: '%', tol: 5, get: (m, c) => [pct(rate(m.inLabor.M)), pct(c.lfp.M)] },
    { label: '실업률', unit: '%', tol: 2, get: (m, c) => [pct(rate(m.unemployed)), pct(c.unemployment)] },
    { label: '흡연율 여성 (15+)', unit: '%', tol: 3, get: (m, c) => [pct(rate(m.smoking.F)), pct(c.smoking.F)] },
    { label: '흡연율 남성 (15+)', unit: '%', tol: 4, get: (m, c) => [pct(rate(m.smoking.M)), pct(c.smoking.M)] },
    { label: '당뇨 유병률 (20~79세)', unit: '%', tol: 2, get: (m, c) => [pct(rate(m.diabetes)), pct(c.diabetesPrev)] },
    { label: '사망 원인: 감염·모성·주산기', unit: '%', tol: 3, get: (m, c) => [pct(m.causes.comm / m.deaths), pct(c.deathShare.comm)] },
    { label: '사망 원인: 비감염성 질환', unit: '%', tol: 3, get: (m, c) => [pct(m.causes.ncd / m.deaths), pct(c.deathShare.ncd)] },
    { label: '사망 원인: 손상(사고·폭력·자살)', unit: '%', tol: 2, get: (m, c) => [pct(m.causes.inj / m.deaths), pct(c.deathShare.inj)] },
    { label: '근로소득 지니 / 소득 지니*', unit: '', tol: 8, get: (m, c) => [100 * gini(m.incomes), 100 * c.gini] },
  ];

  let md = `# 모델 감사\n\n${new Date().toISOString().slice(0, 10)} · 국가마다 성별당 ${n}명을 자동 결정 모드로 살려 본 결과 (보정에 쓰지 않은 시드). 칸마다 **시뮬레이션 / 실제 통계**, ⚠는 허용 오차를 넘은 값.\n\n`;
  md += `> 생성: \`npm run audit\`. \\* 표시는 통계 정의가 완전히 같지 않아 참고용(대학 진학 vs 총취학률, 근로소득 vs 가처분소득 지니). 출처는 [data/SOURCES.md](../data/SOURCES.md).\n\n`;
  md += `| 항목 | 허용 | ${COUNTRIES.join(' | ')} |\n|---|---|${COUNTRIES.map(() => '---').join('|')}|\n`;
  const summary: string[] = [];
  for (const r of rows) {
    let bad = 0;
    const cells = COUNTRIES.map((iso) => {
      const [sim, real] = r.get(results.get(iso)!, world.country(iso));
      const off = !Number.isFinite(sim) || Math.abs(sim - real) > r.tol;
      if (off) bad++;
      return `${f1(sim)} / ${f1(real)}${off ? ' ⚠' : ''}`;
    });
    md += `| ${r.label} | ±${r.tol}${r.unit} | ${cells.join(' | ')} |\n`;
    summary.push(`${bad === 0 ? '✓' : '⚠'} ${r.label}: ${COUNTRIES.length - bad}/${COUNTRIES.length}개국 허용 범위`);
  }
  writeFileSync(join(ROOT, 'docs/model-audit.md'), md);
  console.log(summary.join('\n'));
}
