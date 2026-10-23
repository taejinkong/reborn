// 몬테카를로 보정 계수. scripts/calibrate.ts가 data/build/calibration.json으로 만든다.
// 개인 요인(형편·건강·선택…)을 넣고도 국가 통계(기대수명·결혼 비율·합계출산율)가 유지되도록 맞추는 값이다.
import type { Sex } from './state.ts';

/** 사망 보정 연령대 상한 (미만). [0,1) [1,5) [5,15) … [85,∞) */
export const MORT_BANDS = [1, 5, 15, 30, 45, 60, 75, 85, Infinity] as const;

export function mortBand(age: number): number {
  return MORT_BANDS.findIndex((up) => age < up);
}

export interface CountryCalibration {
  /** 성별·연령대별 개인 사망 배수의 평균. 나누면 인구 평균 배수가 1이 된다. */
  mort: Record<Sex, number[]>;
  /** 결혼(첫 동반자) 위험률 배수 */
  union: Record<Sex, number>;
  /** 동반자가 있는 여성의 출산 확률 배수 */
  fert: number;
}

export interface CalibrationFile {
  generated: string;
  /** 보정에 쓴 content.json의 해시. 콘텐츠가 바뀌면 다시 보정해야 한다. */
  contentHash: string;
  livesPerSex: number;
  iterations: number;
  countries: Record<string, CountryCalibration>;
}

export function defaultCalibration(): CountryCalibration {
  const ones = () => MORT_BANDS.map(() => 1);
  return { mort: { F: ones(), M: ones() }, union: { F: 1, M: 1 }, fert: 1.3 };
}

/** 결혼 위험률 모양: 평균 초혼 연령 근처에서 가장 높은 정규분포 (15~49세 합이 1) */
const UNION_SD = 5;
export function unionShape(age: number, meanAge: number): number {
  if (age < 15 || age > 60) return 0;
  const pdf = (a: number) => Math.exp(-0.5 * ((a - meanAge) / UNION_SD) ** 2);
  let total = 0;
  for (let a = 15; a <= 49; a++) total += pdf(a);
  return pdf(age) / total;
}

/**
 * 아직 동반자를 만난 적 없는 사람이 올해 만날 확률.
 * 45~49세까지 결혼한 비율 p에서 누적 위험률 −ln(1−p)를 연령별로 나눈 뒤, 보정 배수 k를 곱한다.
 */
export function unionHazard(age: number, everMarried: number, meanAge: number, k: number): number {
  const cum = -Math.log(1 - Math.min(everMarried, 0.995));
  // 만남과 결혼 사이의 시간만큼 앞당긴다
  return 1 - Math.exp(-k * cum * unionShape(age, meanAge - 1.5));
}
