// 보정(calibrate.ts)과 감사(audit.ts)가 함께 쓰는 측정 코드.
// 한 나라에서 성별마다 n명을 자동 결정 모드로 살려 보고, 통계와 비교할 값들을 센다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MORT_BANDS, mortBand, type CauseGroup } from '../packages/engine/src/calibration.ts';
import { Life } from '../packages/engine/src/life.ts';
import { CAUSE_GROUP, type Cause } from '../packages/engine/src/mortality.ts';
import type { Sex } from '../packages/engine/src/state.ts';
import { World } from '../packages/engine/src/world.ts';

export const ROOT = join(import.meta.dirname, '..');
export const INPUT_FILES = {
  countries: join(ROOT, 'data/build/countries.json'),
  lifetable: join(ROOT, 'data/build/lifetables/2023.json'),
  content: join(ROOT, 'content/build/content.json'),
};
export const CALIBRATION_FILE = join(ROOT, 'data/build/calibration.json');

export function loadWorld(withCalibration = true): World {
  const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  return new World({
    countries: json(INPUT_FILES.countries),
    lifetable: json(INPUT_FILES.lifetable),
    content: json(INPUT_FILES.content),
    calibration: withCalibration && existsSync(CALIBRATION_FILE) ? json(CALIBRATION_FILE) : undefined,
  });
}

/** [해당 수, 전체 수] */
export type Counter = [number, number];
const ratio = (c: Counter) => (c[1] ? c[0] / c[1] : NaN);

export interface Measures {
  mortSum: Record<Sex, number[]>;
  mortN: Record<Sex, number[]>;
  births: number[];
  womanYears: number[];
  deathAge: Record<Sex, Counter>;
  married47: Record<Sex, Counter>;
  divorced47: Record<Sex, Counter>;
  childMarriage: Counter;
  inLabor: Record<Sex, Counter>;
  unemployed: Counter;
  smoking: Record<Sex, Counter>;
  diabetes: Counter;
  causes: Record<CauseGroup, number>;
  causeDetail: Partial<Record<Cause, number>>;
  deaths: number;
  urban: Counter;
  primary: Counter;
  secondary: Counter;
  tertiary: Counter;
  incomes: number[];
}

export function measureCountry(world: World, iso: string, n: number, tag: string): Measures {
  const zeros = () => MORT_BANDS.map(() => 0);
  const ctr = (): Counter => [0, 0];
  const m: Measures = {
    mortSum: { F: zeros(), M: zeros() }, mortN: { F: zeros(), M: zeros() },
    births: Array(50).fill(0), womanYears: Array(50).fill(0),
    deathAge: { F: ctr(), M: ctr() }, married47: { F: ctr(), M: ctr() }, divorced47: { F: ctr(), M: ctr() },
    childMarriage: ctr(), inLabor: { F: ctr(), M: ctr() }, unemployed: ctr(), smoking: { F: ctr(), M: ctr() },
    diabetes: ctr(), causes: { comm: 0, ncd: 0, inj: 0 }, causeDetail: {}, deaths: 0,
    urban: ctr(), primary: ctr(), secondary: ctr(), tertiary: ctr(), incomes: [],
  };
  const add = (c: Counter, hit: boolean) => { c[0] += hit ? 1 : 0; c[1]++; };

  for (const sex of ['F', 'M'] as Sex[]) {
    for (let i = 0; i < n; i++) {
      const l = Life.born(world, { seed: `${tag}:${iso}:${sex}:${i}`, country: iso, sex });
      l.observe = (o) => {
        const b = mortBand(o.age);
        m.mortSum[o.sex][b] += o.raw;
        m.mortN[o.sex][b]++;
      };
      add(m.urban, l.p.urban);
      let marriedBefore18 = false;
      while (l.alive) {
        const p = l.p, a = p.age;
        // 그 해 시작 시점의 상태로 센다
        if (a === 7) add(m.primary, p.edu.school !== null || p.edu.level !== 'none');
        if (a === 14) add(m.secondary, p.edu.school?.stage === 'secondary' || ['secondary', 'tertiary', 'graduate'].includes(p.edu.level));
        if (a === 23) add(m.tertiary, p.edu.school?.stage === 'tertiary' || ['tertiary', 'graduate'].includes(p.edu.level));
        if (a === 18 && sex === 'F') marriedBefore18 = p.flags.everMarried === true;
        if (a === 22 && sex === 'F') add(m.childMarriage, marriedBefore18);
        if (a === 47) {
          add(m.married47[sex], p.flags.everMarried === true);
          add(m.divorced47[sex], p.flags.everMarried === true && !p.family.partner?.married && !p.flags.widowed);
        }
        if (a >= 15 && a < 65) {
          // 경제활동인구 = 취업자 + 일을 찾는 사람 (ILO 정의, 15~64세가 분모)
          const seeking = !p.job && p.flags.outOfLabor === false && !p.edu.school && !p.retired;
          add(m.inLabor[sex], p.job !== null || seeking);
          if (p.job !== null || seeking) add(m.unemployed, seeking);
        }
        if (a >= 15) add(m.smoking[sex], p.habits.smoker);
        if (a >= 20 && a < 80) add(m.diabetes, p.conditions.includes('diabetes'));
        if (p.job && p.money.income > 0 && a >= 25 && a < 60) m.incomes.push(p.money.income);
        const kids = p.family.children.length;
        l.step({ autoFocus: true });
        if (l.p.pending) l.autoChoose();
        if (sex === 'F' && a >= 15 && a <= 49 && l.alive) {
          m.womanYears[a]++;
          m.births[a] += l.p.family.children.length - kids;
        }
      }
      const d = l.p.dead!;
      m.deathAge[sex][0] += d.age + 0.5;
      m.deathAge[sex][1]++;
      const cause = d.cause as Cause;
      m.causes[CAUSE_GROUP[cause] ?? 'ncd']++;
      m.causeDetail[cause] = (m.causeDetail[cause] ?? 0) + 1;
      m.deaths++;
    }
  }
  return m;
}

export const rate = ratio;
export const tfrOf = (m: Measures) => m.births.reduce((t, b, a) => t + (m.womanYears[a] ? b / m.womanYears[a] : 0), 0);
export const e0Of = (m: Measures, sex: Sex) => ratio(m.deathAge[sex]);

export function gini(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length, total = s.reduce((t, x) => t + x, 0);
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * s[i];
  return cum / (n * total);
}

/** 생명표로 계산한 출생 시 기대수명 */
export function lifetableE0(q: number[]): number {
  let alive = 1, total = 0;
  for (const qx of q) {
    const d = alive * qx;
    total += alive - d + d * 0.5;
    alive -= d;
  }
  return total;
}
