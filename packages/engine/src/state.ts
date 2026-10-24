// 한 사람의 삶 상태. 직렬화 가능한 순수 데이터만 둔다.
import type { STAT_KEYS, EDU_LEVELS, TONES } from './content.ts';

export type StatKey = (typeof STAT_KEYS)[number];
export type EduLevel = (typeof EDU_LEVELS)[number];
export type Tone = (typeof TONES)[number];
export type Sex = 'F' | 'M';
export type Stats = Record<StatKey, number>;

export interface Kin {
  age: number;
  sex: Sex;
  alive: boolean;
}

export interface SchoolState {
  stage: 'primary' | 'secondary' | 'tertiary';
  yearsLeft: number;
}

export interface LogEntry {
  age: number;
  year: number;
  key: string;
  params?: Record<string, string | number>;
  tone: Tone;
  tags?: string[];
}

export interface YearRecord {
  age: number;
  year: number;
  stats: Stats;
  income: number;
  cash: number;
  /** 순자산 (현금+예금+주식+집+부동산−빚) */
  netWorth: number;
  focus: string | null;
  edu: EduLevel;
  job: string | null;
}

export interface PendingDecision {
  event: string;
  /** 지금 고를 수 있는 선택지 */
  options: string[];
}

export interface Death {
  age: number;
  year: number;
  cause: string;
}

/** 돈 (모두 PPP 달러) */
export interface Money {
  /** 현금·통장 */
  cash: number;
  debt: number;
  /** 연 소득 */
  income: number;
  /** 소득 백분위 0~1 */
  pct: number;
  /** 정기예금 */
  deposit: number;
  /** 주식 (지수펀드) */
  stocks: number;
  /** 내 집 시가 */
  home: number;
  /** 임대용 부동산 시가 */
  property: number;
  /** 소득 중 저축하는 비율 (null이면 형편에 맞게 자동) */
  saveRate: number | null;
}

export interface Person {
  v: 1;
  seed: string;
  rng: [number, number, number, number];
  mode: BirthMode;
  birthYear: number;
  year: number;
  age: number;
  sex: Sex;
  born: string;
  country: string;
  urban: boolean;
  /** 출생 가정 형편 분위 1(최하)~5(최상) */
  household: number;
  stats: Stats;
  money: Money;
  edu: { level: EduLevel; school: SchoolState | null };
  job: string | null;
  jobYears: number;
  retired: boolean;
  family: {
    mother: Kin;
    father: Kin;
    siblings: number;
    partner: (Kin & { married: boolean }) | null;
    children: Kin[];
  };
  conditions: string[];
  habits: { smoker: boolean };
  /** 가진 물건 id → 산 나이 */
  owns: Record<string, number>;
  /** 행동 id → 마지막으로 한 나이 (재사용 대기용) */
  acted: Record<string, number>;
  focus: string | null;
  flags: Record<string, string | number | boolean>;
  /** 한 번 일어난 사건 id → 나이 */
  done: Record<string, number>;
  scheduled: { event: string; age: number }[];
  causeHints: Record<string, number>;
  log: LogEntry[];
  history: YearRecord[];
  pending: PendingDecision | null;
  dead: Death | null;
}

export type BirthMode = 'births' | 'population';
