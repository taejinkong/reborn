// 브라우저 저장소. 접근이 막혀 있거나 비어 있어도 앱은 동작해야 하므로 모든 접근을 감싼다.
import type { BirthMode, Person } from '@reborn/engine';

const KEYS = { settings: 'reborn.settings.v1', current: 'reborn.current.v1', lives: 'reborn.lives.v1' };

export interface Settings {
  mode: BirthMode;
  /** 기대수명까지 사는 데 걸리는 시간(분) */
  pace: 30 | 60 | 90;
  /** 비교용으로 고른 실제 출생국 */
  home: string | null;
  /** 무거운 장면의 자세한 내용 숨기기 */
  soft: boolean;
  /** 갈림길 자동 결정 */
  auto: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: 'births', pace: 60, home: null, soft: false, auto: false };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장할 수 없어도 진행은 계속한다
  }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(KEYS.settings) ?? {}) });
export const saveSettings = (s: Settings) => write(KEYS.settings, s);

export interface SavedLife {
  person: Person;
  pace: Settings['pace'];
  savedAt: number;
}
export const loadCurrent = () => read<SavedLife>(KEYS.current);
export const saveCurrent = (s: SavedLife | null) => write(KEYS.current, s);

/** 끝난 삶의 요약 (전생 기록) */
export interface LifeSummary {
  seed: string;
  born: string;
  sex: 'F' | 'M';
  birthYear: number;
  deathAge: number;
  deathYear: number;
  cause: string;
  urban: boolean;
  household: number;
  edu: string;
  job: string | null;
  children: number;
  married: boolean;
  livedIn: string[];
  /** 마지막 문장과 주요 장면 (렌더링된 문장) */
  epitaph: string;
  highlights: { age: number; text: string }[];
  endedAt: number;
}
const MAX_LIVES = 200;
export const loadLives = () => read<LifeSummary[]>(KEYS.lives) ?? [];
export function addLife(s: LifeSummary): void {
  const lives = loadLives().filter((x) => x.seed !== s.seed);
  write(KEYS.lives, [s, ...lives].slice(0, MAX_LIVES));
}
export const clearLives = () => write(KEYS.lives, null);
