// 콘텐츠 리포트: 출생 비율대로 뽑은 삶을 자동 결정 모드로 살려 보고, 사건마다 얼마나 자주 일어나는지,
// 한 번도 안 일어나는 사건은 없는지, 한 삶의 기록·갈림길 분량이 적당한지 본다. 결과는 docs/content-report.md.
//
//   node scripts/content-report.ts [lives=4000] [--strict]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Life } from '../packages/engine/src/life.ts';
import { ROOT, loadWorld } from './measure.ts';

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 4000);
const strict = args.includes('--strict');
const world = loadWorld();
const year = new Date().getFullYear();

const livesWith = new Map<string, number>();
const decisionCount = new Map<string, number>();
let logLines = 0, decisions = 0, years = 0;
const perLifeLog: number[] = [];
const perLifeDecisions: number[] = [];
const perLifeYears: number[] = [];

for (let i = 0; i < N; i++) {
  const l = Life.born(world, { seed: `report:${i}`, year });
  let d = 0;
  while (l.alive) {
    const r = l.step({ autoFocus: true });
    if (r.decision) {
      d++;
      decisionCount.set(r.decision.id, (decisionCount.get(r.decision.id) ?? 0) + 1);
      l.autoChoose();
    }
  }
  for (const id of Object.keys(l.p.done)) livesWith.set(id, (livesWith.get(id) ?? 0) + 1);
  logLines += l.p.log.length;
  decisions += d;
  years += l.p.history.length;
  perLifeLog.push(l.p.log.length);
  perLifeYears.push(l.p.history.length);
  perLifeDecisions.push(d);
}

const pctOf = (x: number) => `${((100 * x) / N).toFixed(1)}%`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const events = world.content.events;
const never = events.filter((e) => !livesWith.has(e.id));
const tooCommon = events.filter((e) => e.when.once && (livesWith.get(e.id) ?? 0) / N > 0.6 && e.kind === 'happening');

let md = `# 콘텐츠 리포트\n\n${new Date().toISOString().slice(0, 10)} · 출생 비율대로 뽑은 ${N}명의 삶 (자동 결정 모드). 생성: \`npm run content:report\`\n\n`;
md += `| 한 삶 기준 | 평균 | 중앙값 | 목표 |\n|---|---|---|---|\n`;
md += `| 산 햇수 | ${(years / N).toFixed(1)} | ${median(perLifeYears)} | — |\n`;
md += `| 기록 문장 | ${(logLines / N).toFixed(1)} | ${median(perLifeLog)} | 40~90 |\n`;
md += `| 갈림길 | ${(decisions / N).toFixed(1)} | ${median(perLifeDecisions)} | 8~25 |\n\n`;
md += `콘텐츠: 사건 ${events.filter((e) => e.kind === 'happening').length}개, 갈림길 ${events.filter((e) => e.kind === 'decision').length}개, 직업 ${world.content.jobs.length}개, 문장 ${Object.keys(world.content.i18n.ko ?? {}).length}개\n\n`;
if (never.length) md += `## ⚠ 한 번도 일어나지 않은 사건 (${never.length})\n\n${never.map((e) => `- \`${e.id}\``).join('\n')}\n\n`;
if (tooCommon.length) md += `## ⚠ 한 번만 일어나는 사건인데 60%가 넘는 삶에서 일어남\n\n${tooCommon.map((e) => `- \`${e.id}\` ${pctOf(livesWith.get(e.id)!)}`).join('\n')}\n\n`;
md += `## 사건·갈림길별 비율\n\n"일어난 삶"은 한 번이라도 일어난 삶의 비율, "갈림길 횟수"는 한 삶당 평균 횟수.\n\n| id | 종류 | 범주 | 일어난 삶 | 갈림길 횟수 |\n|---|---|---|---|---|\n`;
for (const e of [...events].sort((a, b) => (livesWith.get(b.id) ?? 0) - (livesWith.get(a.id) ?? 0))) {
  md += `| \`${e.id}\` | ${e.kind === 'decision' ? '갈림길' : '사건'} | ${e.category} | ${pctOf(livesWith.get(e.id) ?? 0)} | ${e.kind === 'decision' ? ((decisionCount.get(e.id) ?? 0) / N).toFixed(2) : ''} |\n`;
}
writeFileSync(join(ROOT, 'docs/content-report.md'), md);

console.log(`${N}명: 기록 ${(logLines / N).toFixed(1)}줄, 갈림길 ${(decisions / N).toFixed(1)}번 (한 삶 평균)`);
console.log(`사건 ${events.length}개 중 한 번도 안 일어난 것 ${never.length}개${never.length ? `: ${never.map((e) => e.id).join(', ')}` : ''}`);
if (tooCommon.length) console.log(`너무 흔한 일회성 사건: ${tooCommon.map((e) => e.id).join(', ')}`);
console.log('자세한 표: docs/content-report.md');
if (strict && never.length) process.exitCode = 1;
