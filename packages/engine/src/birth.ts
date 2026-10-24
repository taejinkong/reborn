// 출생 추첨: 국가 → 성별 → 도시/농촌 → 형편 → 가족.
import { clamp, scaleOdds, oddsNormalizer } from './math.ts';
import type { Country } from './data.ts';
import { Rng } from './rng.ts';
import type { BirthMode, Person, Sex } from './state.ts';
import type { World } from './world.ts';

export interface BirthOptions {
  seed?: string;
  mode?: BirthMode;
  /** 지정하면 이 나라에서 태어난다 (테스트·공유 시드용) */
  country?: string;
  /** 지정하면 이 성별로 태어난다 (보정·테스트용) */
  sex?: Sex;
  /** 태어나는 해 (기본: 통계 기준 연도). 앱은 실제 올해를 넘긴다 */
  year?: number;
}

export function chooseCountry(world: World, mode: BirthMode, rng: Rng): Country {
  return rng.weighted(world.countries, (c) => (mode === 'births' ? c.births : c.population))!;
}

/** 나라 c에서 태어날 확률 */
export function birthOdds(world: World, c: Country, mode: BirthMode = 'births'): number {
  const key = mode === 'births' ? 'births' : 'population';
  return c[key] / world.countries.reduce((s, x) => s + x[key], 0);
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function bornPerson(world: World, opts: BirthOptions = {}): Person {
  const seed = opts.seed ?? randomSeed();
  const rng = new Rng(seed);
  const mode = opts.mode ?? 'births';
  const c = opts.country ? world.country(opts.country) : chooseCountry(world, mode, rng);
  const drawn: Sex = rng.chance(c.maleShare) ? 'M' : 'F';
  const sex = opts.sex ?? drawn;
  const household = rng.int(1, 5);

  // 도시 출생: 도시화율을 기준으로 형편이 좋을수록 도시일 가능성이 높다 (평균은 도시화율 유지)
  const urbanSlope = (k: number) => Math.exp(0.35 * (k - 3));
  const norm = oddsNormalizer(c.urban, [1, 2, 3, 4, 5].map(urbanSlope));
  const urban = rng.chance(scaleOdds(c.urban, norm * urbanSlope(household)));

  const motherAge = Math.round(clamp(c.meanAgeBirth + rng.normal() * 5.5, 15, 46));
  const fatherAge = Math.round(clamp(motherAge + 3 + rng.normal() * 4, 16, 70));
  // 형제 수: 합계출산율 기반, 본인을 뺀 나머지
  const siblings = Math.max(0, rng.poisson(Math.max(0.2, c.tfr - 1) * (urban ? 0.9 : 1.15)));

  // 국가 수준의 영유아 위험은 생명표에 이미 들어 있으므로 여기서는 개인차만 둔다
  const health = clamp(82 + (household - 3) * 2 + rng.normal() * 5, 35, 95);
  const p: Person = {
    v: 1,
    seed,
    rng: rng.state,
    mode,
    birthYear: opts.year ?? world.nowYear,
    year: opts.year ?? world.nowYear,
    age: 0,
    sex,
    born: c.id,
    country: c.id,
    urban,
    household,
    stats: {
      health: Math.round(health),
      happiness: Math.round(clamp(60 + rng.normal() * 6, 30, 90)),
      knowledge: Math.round(clamp(20 + (household - 3) * 3, 5, 40)),
      relations: Math.round(clamp(60 + rng.normal() * 6, 30, 90)),
    },
    money: { cash: 0, debt: 0, income: 0, pct: 0, deposit: 0, stocks: 0, home: 0, property: 0, saveRate: null },
    edu: { level: 'none', school: null },
    job: null,
    jobYears: 0,
    retired: false,
    family: {
      mother: { age: motherAge, sex: 'F', alive: true },
      father: { age: fatherAge, sex: 'M', alive: true },
      siblings,
      partner: null,
      children: [],
    },
    conditions: [],
    habits: { smoker: false },
    owns: {},
    acted: {},
    focus: null,
    flags: {},
    done: {},
    scheduled: [],
    causeHints: {},
    log: [],
    history: [],
    pending: null,
    dead: null,
  };
  p.log.push({
    age: 0,
    year: p.year,
    key: urban ? 'sys.birth.urban' : 'sys.birth.rural',
    params: { country: c.id },
    tone: 'light',
  });
  if (siblings > 0) p.log.push({ age: 0, year: p.year, key: 'sys.birth.siblings', params: { siblings }, tone: 'light' });
  return p;
}
