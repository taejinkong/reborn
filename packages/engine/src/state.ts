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
  money: { cash: number; debt: number; income: number; pct: number };
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
