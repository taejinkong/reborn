// 몬테카를로 보정 계수. scripts/calibrate.ts가 data/build/calibration.json으로 만든다.
// 개인 요인(형편·건강·선택…)을 넣고도 국가 통계(기대수명·결혼·출산·노동·흡연·사망 원인…)가
// 유지되도록 맞추는 값이다.
import type { Country } from './data.ts';
import { clamp, scaleOdds } from './math.ts';
import type { Person, Sex } from './state.ts';

/** 사망 보정 연령대 상한 (미만). [0,1) [1,5) [5,15) … [85,∞) */
export const MORT_BANDS = [1, 5, 15, 30, 45, 60, 75, 85, Infinity] as const;

export function mortBand(age: number): number {
  return MORT_BANDS.findIndex((up) => age < up);
}

export type CauseGroup = 'comm' | 'ncd' | 'inj';

export interface CountryCalibration {
  /** 성별·연령대별 개인 사망 배수의 평균. 나누면 인구 평균 배수가 1이 된다. */
  mort: Record<Sex, number[]>;
  /** 18세 이후 첫 결혼 위험률 배수 → 45~49세 결혼 경험 비율 */
  union: Record<Sex, number>;
  /** 동반자가 있는 여성의 출산 확률 배수 → 합계출산율 */
  fert: number;
  /** 18세 전 결혼(여성) 위험률 배수 → 조혼율 */
  childUnion: number;
  /** 이혼 위험률 배수 → 45~49세 이혼·별거 비율 */
  divorce: number;
  /** 경제활동 참여 오즈 배수 → 경제활동참가율 */
  lfp: Record<Sex, number>;
  /** 구직 성공 오즈 배수 → 실업률 */
  find: number;
  /** 흡연 시작 위험률 배수 → 흡연율 */
  smoke: Record<Sex, number>;
  /** 당뇨 발병 위험률 배수 → 당뇨 유병률 */
  diabetes: number;
  /** 사망 원인 3대 분류 가중치 → WHO 사망 원인 비중 */
  cause: Record<CauseGroup, number>;
  /** 노동 이주 위험률 배수 → 해외 거주 비율 중 피란민이 아닌 부분 */
  emig: number;
  /** 피란 위험률 배수 → 해외 거주 비율 중 피란민 부분 */
  flee: number;
}

export interface CalibrationFile {
  generated: string;
  /** 보정에 쓴 입력 파일들의 해시. 콘텐츠·통계가 바뀌면 다시 보정해야 한다. */
  contentHash: string;
  livesPerSex: number;
  iterations: number;
  countries: Record<string, Partial<CountryCalibration>>;
}

export function defaultCalibration(): CountryCalibration {
  const ones = () => MORT_BANDS.map(() => 1);
  return {
    mort: { F: ones(), M: ones() }, union: { F: 1, M: 1 }, fert: 1.3, childUnion: 1, divorce: 1,
    lfp: { F: 1, M: 1 }, find: 1, smoke: { F: 1, M: 1 }, diabetes: 1, cause: { comm: 1, ncd: 1, inj: 1 },
    emig: 1, flee: 1,
  };
}

// ── 결혼 ──────────────────────────────────────────────────

/** 첫 결혼 위험률 모양: 평균 초혼 연령 근처에서 가장 높은 정규분포 (18~49세 합이 1) */
const UNION_SD = 5;
export function unionShape(age: number, meanAge: number): number {
  if (age < 18 || age > 60) return 0;
  const pdf = (a: number) => Math.exp(-0.5 * ((a - meanAge) / UNION_SD) ** 2);
  let total = 0;
  for (let a = 18; a <= 49; a++) total += pdf(a);
  return pdf(age) / total;
}

/**
 * 결혼한 적 없는 18세 이상이 올해 동반자를 만날 확률.
 * 45~49세 결혼 경험 비율 p에서 누적 위험률 −ln(1−p)를 연령별로 나눈 뒤 보정 배수 k를 곱한다.
 */
export function unionHazard(age: number, everMarried: number, meanAge: number, k: number): number {
  const cum = -Math.log(1 - Math.min(everMarried, 0.995));
  // 만남과 결혼 사이의 시간만큼 앞당긴다
  return 1 - Math.exp(-k * cum * unionShape(age, meanAge - 1.5));
}

/** 사별·이혼 뒤 다시 동반자를 만날 확률 (추정: 연 5%를 그 나라 결혼 경향으로 조정, 나이가 많을수록 낮음) */
export function remarriageHazard(age: number, everMarried: number, k: number): number {
  if (age >= 75) return 0;
  return clamp(0.05 * everMarried * k * (age < 45 ? 1 : 0.5), 0, 0.5);
}

/** 12~17세 여성이 결혼하게 될 확률. 조혼율(20~24세 중 18세 전 결혼)을 연령별로 나눈다. */
const CHILD_UNION_W = [0.04, 0.08, 0.13, 0.2, 0.25, 0.3]; // 12..17세
export function childUnionHazard(age: number, childMarriage: number, k: number): number {
  if (age < 12 || age > 17) return 0;
  const cum = -Math.log(1 - Math.min(childMarriage, 0.95));
  return 1 - Math.exp(-k * cum * CHILD_UNION_W[age - 12]);
}

/** 결혼 기간별 이혼 위험률 (추정 모양: 초기에 높고 점차 낮아짐). 수준은 보정으로 맞춘다. */
export function divorceHazard(yearsMarried: number, k: number): number {
  const shape = yearsMarried < 5 ? 1.5 : yearsMarried < 15 ? 1 : yearsMarried < 25 ? 0.6 : 0.3;
  return clamp(0.008 * k * shape, 0, 0.3);
}

// ── 노동 ──────────────────────────────────────────────────

/** 경제활동 인구에 속할 정상 상태 확률 (국가 경제활동참가율 기준, 보정 오즈 배수) */
export function laborShare(c: Country, sex: Sex, k: number): number {
  return scaleOdds(clamp(c.lfp[sex], 0.02, 0.98), k);
}

/** 일을 찾는 사람이 한 해 안에 일자리를 구할 확률 */
export function jobFindProb(age: number, k: number): number {
  return scaleOdds(age < 20 ? 0.45 : 0.65, k);
}

// ── 건강 습관·질병 ────────────────────────────────────────

/** 14~30세 비흡연자가 올해 흡연을 시작할 확률 */
export function smokeStartHazard(c: Country, sex: Sex, k: number): number {
  return clamp((c.smoking[sex] / 9) * k, 0, 0.8);
}

/** 흡연자가 올해 담배를 끊을 확률 (추정: 연 4%, 흡연이 흔한 나라일수록 끊기 어렵다) */
export function smokeQuitHazard(c: Country, sex: Sex, k: number): number {
  return 0.04 / Math.max(1, k / 2) * (c.smoking[sex] > 0.5 ? 0.6 : 1);
}

/** 30세 이상이 올해 당뇨 진단을 받을 확률 (나이가 많을수록 높음) */
export function diabetesHazard(c: Country, age: number, k: number): number {
  if (age < 30) return 0;
  return clamp((c.diabetesPrev / 25) * k * Math.min(2, (age - 25) / 25), 0, 0.2);
}

// ── 국제 이주 ──────────────────────────────────────────────

/** 노동 이주 나이 모양: 27세 중심 정규분포 (18~50세 합이 1) */
function emigShape(age: number): number {
  if (age < 18 || age > 50) return 0;
  const pdf = (a: number) => Math.exp(-0.5 * ((a - 27) / 7) ** 2);
  let total = 0;
  for (let a = 18; a <= 50; a++) total += pdf(a);
  return pdf(age) / total;
}

/** 출생국에 사는 18~50세가 올해 해외로 일하러 갈 기회를 만날 확률 */
export function emigrateHazard(age: number, c: Country, k: number): number {
  const cum = -Math.log(1 - Math.min(c.emigrantShare * (1 - c.refugeeShare), 0.9));
  return 1 - Math.exp(-k * cum * emigShape(age));
}

/** 출생국에 사는 사람이 올해 나라 밖으로 피란할 확률 (나이와 무관, 가족 단위) */
export function fleeHazard(c: Country, k: number): number {
  const cum = -Math.log(1 - Math.min(c.emigrantShare * c.refugeeShare, 0.9));
  return 1 - Math.exp((-k * cum) / 40);
}

/** 해외에 사는 사람이 올해 귀국을 고민하게 될 확률 (추정: 노동 이주 연 5%, 피란 연 3%) */
export function returnHazard(refugee: boolean): number {
  return refugee ? 0.03 : 0.05;
}

/** 표현식에서 `rates.*`로 쓰는 올해 확률들 */
export function personRates(p: Person, c: Country, cal: CountryCalibration, born?: Country, bornCal?: CountryCalibration) {
  const married = p.flags.everMarried === true;
  return {
    union: married ? remarriageHazard(p.age, c.everMarried[p.sex], cal.union[p.sex]) : unionHazard(p.age, c.everMarried[p.sex], c.marriageAge[p.sex], cal.union[p.sex]),
    childUnion: p.sex === 'F' ? childUnionHazard(p.age, c.childMarriage, cal.childUnion) : 0,
    divorce: p.family.partner?.married ? divorceHazard(p.age - Number(p.flags.marriedAge ?? p.age), cal.divorce) : 0,
    smoke: smokeStartHazard(c, p.sex, cal.smoke[p.sex]),
    quitSmoke: smokeQuitHazard(c, p.sex, cal.smoke[p.sex]),
    diabetes: diabetesHazard(c, p.age, cal.diabetes),
    // 이주 관련 확률은 출생국 통계를 쓴다 (c는 지금 사는 나라)
    emigrate: born && bornCal && p.country === p.born ? emigrateHazard(p.age, born, bornCal.emig) : 0,
    flee: born && bornCal && p.country === p.born ? fleeHazard(born, bornCal.flee) : 0,
    returnHome: returnHazard(p.flags.refugee === true),
  };
}
