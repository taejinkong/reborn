// 사망 모델: 생명표 q(x) × 개인 배수. 배수는 인구 평균이 1이 되도록 맞춘다.
import { mortBand, type CauseGroup, type CountryCalibration } from './calibration.ts';
import { clamp } from './math.ts';
import type { Country, IncomeGroup } from './data.ts';
import type { Rng } from './rng.ts';
import type { Person, Sex } from './state.ts';

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
// 사망 여부는 생명표가 정하고, 원인은 "이 나이·성별·나라에서 죽었다면 무엇 때문이었을까"를 추첨한다.
// 3대 분류(감염·모성·주산기 / 비감염성 질환 / 손상)의 국가 비중은 WHO GHE 2019(WDI)에 보정으로 맞추고,
// 분류 안의 세부 원인은 국가 통계(교통사고·살인·자살률, 모성사망비, HIV 유병률)와
// 연령 패턴(추정)으로 나눈다. 연령 패턴은 data/SOURCES.md에 추정값으로 표시한다.
export const CAUSES = [
  'neonatal', 'infection', 'maternal', 'hiv',
  'road', 'homicide', 'suicide', 'injury',
  'cardio', 'cancer', 'respiratory', 'diabetes', 'dementia', 'other',
] as const;
export type Cause = (typeof CAUSES)[number];

export const CAUSE_GROUP: Record<Cause, CauseGroup> = {
  neonatal: 'comm', infection: 'comm', maternal: 'comm', hiv: 'comm',
  road: 'inj', homicide: 'inj', suicide: 'inj', injury: 'inj',
  cardio: 'ncd', cancer: 'ncd', respiratory: 'ncd', diabetes: 'ncd', dementia: 'ncd', other: 'ncd',
};

/** 무거운 내용이라 기록에 도움받을 곳을 함께 남기는 원인 */
export const SENSITIVE_CAUSES: readonly Cause[] = ['suicide', 'homicide'];

// 연령대(MORT_BANDS)별 상대 가중치 — 추정 패턴
const GROUP_AGE: Record<CauseGroup, number[]> = {
  //      <1  1-4 5-14 15-29 30-44 45-59 60-74 75-84 85+
  comm: [90, 60, 35, 20, 18, 12, 9, 10, 12],
  ncd: [8, 15, 25, 25, 45, 75, 85, 88, 86],
  inj: [2, 25, 40, 55, 37, 13, 6, 2, 2],
};
const SUB_AGE: Record<Cause, number[]> = {
  neonatal: [75, 0, 0, 0, 0, 0, 0, 0, 0],
  infection: [25, 100, 100, 70, 60, 70, 80, 90, 95],
  maternal: [0, 0, 0, 1, 1, 0, 0, 0, 0],
  hiv: [0, 2, 3, 30, 40, 20, 5, 1, 0],
  road: [0, 20, 25, 40, 35, 30, 25, 15, 10],
  homicide: [0, 5, 5, 45, 30, 15, 5, 3, 2],
  suicide: [0, 0, 5, 35, 35, 30, 25, 25, 25],
  injury: [100, 100, 60, 25, 30, 35, 45, 70, 90],
  cardio: [0, 0, 5, 15, 25, 30, 35, 40, 45],
  cancer: [0, 15, 25, 25, 35, 40, 35, 25, 15],
  respiratory: [5, 5, 5, 5, 5, 8, 12, 12, 12],
  diabetes: [0, 0, 1, 3, 5, 7, 7, 6, 5],
  dementia: [0, 0, 0, 0, 0, 1, 5, 14, 22],
  other: [95, 80, 64, 52, 30, 14, 6, 3, 1],
};
/** 남성 대비 여성 상대 위험이 크게 다른 손상 원인 (추정) */
const MALE_K: Partial<Record<Cause, number>> = { road: 2.5, homicide: 4, suicide: 2.5 };

/** 국가·성별 수준의 세부 원인 가중치 (개인 요인 제외) */
function baseSubWeight(cause: Cause, band: number, sex: Sex, c: Country, birthThisYear: boolean): number {
  const a = SUB_AGE[cause][band];
  if (!a) return 0;
  const male = sex === 'M' ? MALE_K[cause] ?? 1 : 1;
  switch (cause) {
    case 'maternal':
      return sex === 'F' ? (c.mmr / 100) * (birthThisYear ? 8 : 0.3) : 0;
    case 'hiv':
      return a * c.hivPrev * 50;
    case 'road':
      return a * c.roadDeaths * male;
    case 'homicide':
      return a * c.homicide * male;
    case 'suicide':
      return a * c.suicide * male;
    case 'injury':
      return a * 6;
    default:
      return a;
  }
}

function personalK(cause: Cause, p: Person): number {
  let k = p.causeHints[cause] ?? 1;
  if (p.habits.smoker) k *= cause === 'cancer' ? 1.5 : cause === 'respiratory' ? 2 : cause === 'cardio' ? 1.3 : 1;
  return k;
}

export function drawCause(p: Person, c: Country, rng: Rng, cal?: CountryCalibration): Cause {
  const band = mortBand(p.age);
  const birthThisYear = p.flags.lastBirthYear === p.year;
  const weights: [Cause, number][] = [];
  for (const g of ['comm', 'ncd', 'inj'] as CauseGroup[]) {
    const subs = CAUSES.filter((x) => CAUSE_GROUP[x] === g);
    const base = subs.map((x) => baseSubWeight(x, band, p.sex, c, birthThisYear));
    const total = base.reduce((s, w) => s + w, 0);
    if (!total) continue;
    const gw = GROUP_AGE[g][band] * (cal?.cause[g] ?? 1);
    subs.forEach((x, i) => weights.push([x, (gw * base[i] * personalK(x, p)) / total]));
  }
  return rng.weighted(weights, ([, w]) => w)?.[0] ?? 'other';
}
