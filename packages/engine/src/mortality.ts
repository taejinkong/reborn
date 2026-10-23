// 사망 모델: 생명표 q(x) × 개인 배수. 배수는 인구 평균이 1이 되도록 맞춘다.
import { mortBand, type CountryCalibration } from './calibration.ts';
import { clamp } from './math.ts';
import type { Country, IncomeGroup } from './data.ts';
import type { Rng } from './rng.ts';
import type { Person } from './state.ts';

/** 형편(소득 분위)에 따른 사망 위험 기울기. 저소득국일수록 격차가 크다. */
const CLASS_GRADIENT: Record<IncomeGroup, number> = { LIC: 0.25, LMC: 0.2, UMC: 0.15, HIC: 0.1 };

/** 나이별 기대 건강 상태값. 개인 건강이 이보다 낮으면 위험이 커진다. */
export function expectedHealth(age: number): number {
  return age < 30 ? 82 : 82 - (age - 30) * 0.55;
}

/** 1~5분위에 대한 exp(-g·(q-3))의 평균. 나누면 인구 평균 배수가 1이 된다. */
function classNorm(g: number): number {
  let s = 0;
  for (let q = 1; q <= 5; q++) s += Math.exp(-g * (q - 3));
  return s / 5;
}

/** 성인은 현재 소득 백분위로, 미성년은 출생 형편으로 계층을 본다. */
function classLevel(p: Person): number {
  return p.age < 18 || p.money.income <= 0 ? p.household : clamp(p.money.pct * 5 + 0.5, 1, 5);
}

/** 보정 전 개인 사망 배수 */
export function rawMortalityMultiplier(p: Person, c: Country): number {
  let m = 1;
  const g = CLASS_GRADIENT[c.income];
  m *= Math.exp(-g * (classLevel(p) - 3)) / classNorm(g);
  m *= Math.exp((expectedHealth(p.age) - p.stats.health) * (p.age < 5 ? 0.02 : 0.03));
  if (p.age >= 30) {
    // 흡연자 상대위험 1.7, 국가 흡연율로 평균을 맞춘다
    const share = c.smoking[p.sex] || 0;
    m *= (p.habits.smoker ? 1.7 : 1) / (1 + 0.7 * share);
  }
  m *= Math.pow(1.3, p.conditions.length);
  // 초고령에서는 개인차가 줄어든다
  if (p.age >= 85) m = Math.pow(m, clamp(1 - (p.age - 85) / 20, 0.3, 1));
  return m;
}

/** 개인 사망 배수. 보정표로 나눠 국가·성별·연령대 평균이 1이 되게 한다. */
export function mortalityMultiplier(p: Person, c: Country, cal?: CountryCalibration): number {
  const norm = cal ? cal.mort[p.sex][mortBand(p.age)] : 1;
  return clamp(rawMortalityMultiplier(p, c) / norm, 0.25, 9);
}

/** 올해 사망 확률 (오즈 대신 생존확률 거듭제곱으로 배수를 적용) */
export function deathProbability(q: number, m: number): number {
  return 1 - Math.pow(1 - q, m);
}

// ── 사망 원인 ──────────────────────────────────────────────
// 임시 분포: WHO GHE 연동 전까지 쓰는 연령대·소득그룹별 대략적 비중. (data/SOURCES.md 참고)
export const CAUSES = ['neonatal', 'infection', 'injury', 'cardio', 'cancer', 'respiratory', 'diabetes', 'dementia', 'maternal', 'other'] as const;
export type Cause = (typeof CAUSES)[number];

type Mix = Partial<Record<Cause, number>>;
const LOW_INCOME: [number, Mix][] = [
  [1, { neonatal: 55, infection: 30, other: 15 }],
  [5, { infection: 65, injury: 12, other: 23 }],
  [15, { infection: 40, injury: 35, other: 25 }],
  [50, { infection: 30, injury: 25, cardio: 12, cancer: 10, maternal: 8, other: 15 }],
  [70, { cardio: 30, cancer: 18, infection: 17, respiratory: 10, diabetes: 7, other: 18 }],
  [200, { cardio: 38, cancer: 12, respiratory: 13, infection: 12, dementia: 6, diabetes: 6, other: 13 }],
];
const HIGH_INCOME: [number, Mix][] = [
  [1, { neonatal: 70, other: 30 }],
  [5, { injury: 35, cancer: 20, other: 45 }],
  [15, { injury: 45, cancer: 25, other: 30 }],
  [50, { injury: 35, cancer: 30, cardio: 18, other: 17 }],
  [70, { cancer: 42, cardio: 30, respiratory: 6, diabetes: 4, other: 18 }],
  [200, { cardio: 34, cancer: 22, dementia: 14, respiratory: 10, diabetes: 4, other: 16 }],
];

export function drawCause(p: Person, c: Country, rng: Rng): Cause {
  const table = c.income === 'HIC' || c.income === 'UMC' ? HIGH_INCOME : LOW_INCOME;
  const mix: Mix = { ...table.find(([upTo]) => p.age < upTo)![1] };
  if (p.sex === 'M') delete mix.maternal;
  if (p.habits.smoker) { mix.cancer = (mix.cancer ?? 0) * 1.5; mix.respiratory = (mix.respiratory ?? 0) * 2; mix.cardio = (mix.cardio ?? 0) * 1.3; }
  for (const [cause, k] of Object.entries(p.causeHints)) if (cause in mix) mix[cause as Cause]! *= k;
  const entries = Object.entries(mix) as [Cause, number][];
  return rng.weighted(entries, ([, w]) => w)?.[0] ?? 'other';
}
