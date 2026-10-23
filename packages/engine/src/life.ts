// 한 사람의 삶을 1년 단위로 진행한다.
import { bornPerson, type BirthOptions } from './birth.ts';
import type { ChanceDef, DecisionDef, EffectsDef, EventDef, FocusDef, HappeningDef, JobDef } from './content.ts';
import { EDU_LEVELS } from './content.ts';
import type { Country } from './data.ts';
import { compile, type Expr, type Scope } from './expr.ts';
import { clamp, lognormalIncome, oddsNormalizer, scaleOdds } from './math.ts';
import { jobFindProb, laborShare, personRates } from './calibration.ts';
import { SENSITIVE_CAUSES, deathProbability, drawCause, expectedHealth, mortalityMultiplier, rawMortalityMultiplier } from './mortality.ts';
import { Rng } from './rng.ts';
import type { Kin, LogEntry, Person, StatKey, Tone } from './state.ts';
import type { World } from './world.ts';

/** 연간 무작위 사건 최대 개수 */
const MAX_HAPPENINGS = 3;
/** 1년 실제 시간 하한·상한(초) */
const YEAR_SEC = [12, 120] as const;
/** 노동소득이 1인당 GDP에서 차지하는 비율 (근사) */
const LABOR_SHARE = 0.6;
/** 경제활동 상태를 해마다 다시 정하는 비율 */
const LABOR_TURNOVER = 0.15;

export interface YearResult {
  age: number;
  year: number;
  entries: LogEntry[];
  decision: DecisionDef | null;
  died: boolean;
}

const exprCache = new Map<string, (s: Scope) => unknown>();
function run(e: Expr, scope: Scope): unknown {
  if (typeof e !== 'string') return e;
  let f = exprCache.get(e);
  if (!f) exprCache.set(e, (f = compile(e)));
  return f(scope);
}
const normCache = new Map<string, number>();

/** 보정 스크립트용 관찰 이벤트 */
export type Observation = { type: 'mortality'; age: number; sex: 'F' | 'M'; raw: number };

export class Life {
  readonly world: World;
  readonly p: Person;
  private rng: Rng;
  /** 보정·분석용 관찰 콜백 (게임 진행에는 영향 없음) */
  observe?: (o: Observation) => void;

  constructor(world: World, person: Person) {
    this.world = world;
    this.p = person;
    this.rng = new Rng(person.rng);
  }

  static born(world: World, opts?: BirthOptions): Life {
    return new Life(world, bornPerson(world, opts));
  }

  get country(): Country {
    return this.world.country(this.p.country);
  }

  get alive(): boolean {
    return !this.p.dead;
  }

  /** 인생 길이 설정(분)에 따른 1년의 실제 시간(초) */
  yearSeconds(paceMin: number): number {
    const le = this.world.country(this.p.born).lifeExp[this.p.sex];
    return clamp((paceMin * 60) / Math.max(le, 60), YEAR_SEC[0], YEAR_SEC[1]);
  }

  // ── 표현식 환경 ───────────────────────────────────────────
  scope(): Scope {
    const p = this.p, c = this.country;
    return {
      vars: {
        age: p.age,
        sex: p.sex,
        year: p.year,
        stats: p.stats,
        money: p.money,
        edu: { level: p.edu.level, rank: EDU_LEVELS.indexOf(p.edu.level), inSchool: !!p.edu.school, stage: p.edu.school?.stage ?? null },
        job: p.job,
        family: {
          partner: !!p.family.partner,
          married: !!p.family.partner?.married,
          children: p.family.children.filter((k) => k.alive).length,
          motherAlive: p.family.mother.alive,
          fatherAlive: p.family.father.alive,
          siblings: p.family.siblings,
        },
        flags: p.flags,
        country: { ...c, lifeExp: c.lifeExp[p.sex], smoking: c.smoking[p.sex], raw: undefined },
        household: p.household,
        urban: p.urban,
        habits: p.habits,
        focus: p.focus,
        retired: p.retired,
        migrant: p.country !== p.born,
        /** 올해 확률들 (국가 통계 + 보정): union, childUnion, divorce, smoke, diabetes */
        rates: personRates(p, c, this.world.calibration(p.country)),
      },
      fns: {
        has: (id) => p.conditions.includes(id as string),
        did: (id) => (id as string) in p.done,
        clamp: (x, lo, hi) => clamp(x as number, lo as number, hi as number),
        min: (...xs) => Math.min(...(xs as number[])),
        max: (...xs) => Math.max(...(xs as number[])),
        rand: () => this.rng.next(),
        pct: (x) => clamp((x as number) / 100, 0, 1),
      },
    };
  }

  /** 기준 확률 + 오즈 보정. 형편(household) 항은 인구 평균이 기준값이 되도록 정규화한다. */
  chance(ch: ChanceDef, key: string): number {
    const s = this.scope();
    if (typeof ch !== 'object') return clamp(Number(run(ch, s)), 0, 1);
    const base = clamp(Number(run(ch.base, s)), 0, 1);
    let k = 1;
    const hhTerms: { beta: number; center: number }[] = [];
    for (const o of ch.odds) {
      if ('if' in o) {
        if (run(o.if, s)) k *= o.x;
      } else {
        k *= Math.exp(o.beta * (Number(run(o.by, s)) - o.center));
        if (o.by === 'household') hhTerms.push(o);
      }
    }
    if (ch.normalize && hhTerms.length && base > 0 && base < 1) {
      const nk = `${key}|${base.toFixed(4)}`;
      let n = normCache.get(nk);
      if (n === undefined) {
        const f = (h: number) => hhTerms.reduce((m, t) => m * Math.exp(t.beta * (h - t.center)), 1);
        n = oddsNormalizer(base, [1, 2, 3, 4, 5].map(f));
        normCache.set(nk, n);
      }
      k *= n;
    }
    return scaleOdds(base, k);
  }

  // ── 초점 ──────────────────────────────────────────────────
  focusOptions(): FocusDef[] {
    const s = this.scope();
    return this.world.content.focus.filter((f) => this.p.age >= f.age[0] && this.p.age <= f.age[1] && (f.if === undefined || run(f.if, s)));
  }

  setFocus(id: string | null): void {
    if (id !== null && !this.focusOptions().some((f) => f.id === id)) throw new Error(`지금 고를 수 없는 초점 ${id}`);
    this.p.focus = id;
  }

  private autoFocus(): void {
    const opts = this.focusOptions();
    if (!opts.length) { this.p.focus = null; return; }
    if (this.p.focus && opts.some((f) => f.id === this.p.focus) && this.rng.chance(0.6)) return;
    const s = this.scope();
    this.p.focus = this.rng.weighted(opts, (f) => Number(run(f.auto, s)))?.id ?? null;
  }

  // ── 1년 진행 ─────────────────────────────────────────────
  /**
   * 1년을 산다. autoFocus=true면 고를 수 없는 초점을 자동으로 바꾼다.
   * 갈림길이 생기면 decision에 담아 돌려주고, choose()로 고를 때까지 다음 해로 갈 수 없다.
   */
  step(opts: { autoFocus?: boolean } = {}): YearResult {
    const p = this.p;
    if (p.dead) throw new Error('이미 끝난 삶');
    if (p.pending) throw new Error('결정을 기다리는 중');
    const from = p.log.length;

    const valid = p.focus && this.focusOptions().some((f) => f.id === p.focus);
    if (opts.autoFocus || !valid) this.autoFocus();

    this.applyFocus();
    this.naturalChange();
    this.schoolYear();
    this.workYear();
    this.familyYear();
    const decision = this.eventsYear();
    const died = this.deathCheck();
    if (died) p.pending = null;

    p.history.push({
      age: p.age, year: p.year, stats: { ...p.stats }, income: Math.round(p.money.income),
      cash: Math.round(p.money.cash), focus: p.focus, edu: p.edu.level, job: p.job,
    });
    const result: YearResult = { age: p.age, year: p.year, entries: p.log.slice(from), decision: died ? null : decision, died };
    if (!died) { p.age++; p.year++; }
    this.sync();
    return result;
  }

  private sync(): void {
    this.p.rng = this.rng.state;
  }

  private log(key: string, tone: Tone = 'neutral', params?: LogEntry['params'], tags?: string[]): void {
    this.p.log.push({ age: this.p.age, year: this.p.year, key, tone, params, tags });
  }

  private addStat(k: StatKey, d: number): void {
    this.p.stats[k] = clamp(this.p.stats[k] + d, 0, 100);
  }

  private applyFocus(): void {
    const f = this.p.focus ? this.world.focus.get(this.p.focus) : null;
    if (!f) return;
    for (const [k, d] of Object.entries(f.stats)) this.addStat(k as StatKey, d);
  }

  /** 노화·회복 등 매년 저절로 일어나는 변화 */
  private naturalChange(): void {
    const p = this.p;
    this.addStat('health', 0.2 * (expectedHealth(p.age) - p.stats.health) + this.rng.normal() * 2);
    this.addStat('happiness', 0.15 * (55 - p.stats.happiness) + this.rng.normal() * 2.5);
    this.addStat('relations', 0.1 * (55 - p.stats.relations) + this.rng.normal() * 2);
    if (p.age >= 70) this.addStat('knowledge', -0.5);
  }

  // ── 학교 ──────────────────────────────────────────────────
  private schoolYear(): void {
    const p = this.p, c = this.country;
    const sc = p.edu.school;
    if (sc) {
      this.addStat('knowledge', 3);
      if (--sc.yearsLeft > 0) return;
      p.edu.school = null;
      if (sc.stage === 'primary') {
        p.edu.level = 'primary';
        this.log('sys.school.primary_done', 'light');
        const pCont = this.chance({ base: clamp(c.secondaryEnroll / Math.max(c.primaryEnroll, 0.01), 0, 0.99), odds: [{ by: 'household', beta: 0.45, center: 3 }, { by: 'stats.knowledge', beta: 0.03, center: 45 }], normalize: true }, 'sys.secondary');
        if (this.rng.chance(pCont)) {
          p.edu.school = { stage: 'secondary', yearsLeft: 6 };
          this.log('sys.school.secondary_start', 'light');
        } else this.log('sys.school.stop_after_primary', 'neutral');
      } else if (sc.stage === 'secondary') {
        p.edu.level = 'secondary';
        p.flags.hsGrad = true;
        // 진로 갈림길(콘텐츠)이 열릴 때까지 자동 구직을 멈춘다. 갈림길 선택지가 이 플래그를 지운다.
        p.flags.choosingPath = true;
        this.log('sys.school.secondary_done', 'light');
      } else {
        p.edu.level = p.edu.level === 'tertiary' ? 'graduate' : 'tertiary';
        this.log(p.edu.level === 'graduate' ? 'sys.school.graduate_done' : 'sys.school.tertiary_done', 'light', undefined, ['achievement']);
        this.call('job.seek');
      }
      return;
    }
    if (p.age === 6 && p.edu.level === 'none') {
      const pIn = this.chance({ base: c.primaryEnroll, odds: [{ by: 'household', beta: 0.5, center: 3 }, { if: 'urban', x: 1.5 }], normalize: true }, 'sys.primary');
      if (this.rng.chance(pIn)) {
        p.edu.school = { stage: 'primary', yearsLeft: 6 };
        this.log('sys.school.primary_start', 'light');
      } else this.log('sys.school.no_school', 'heavy');
    }
  }

  // ── 일과 돈 ──────────────────────────────────────────────
  private workYear(): void {
    const p = this.p, c = this.country;
    const mean = c.gdpPppPc * LABOR_SHARE;
    if (p.job && !p.retired) {
      p.jobYears++;
      // 경력이 쌓이면 백분위가 조금씩 오르고, 중년 이후 정체
      const drift = p.age < 45 ? 0.006 : p.age < 55 ? 0.002 : -0.002;
      p.money.pct = clamp(p.money.pct + drift + this.rng.normal() * 0.01, 0.01, 0.995);
      p.money.income = lognormalIncome(mean, c.gini, p.money.pct);
      if (p.age >= this.retireAge() || (p.age >= 55 && p.stats.health < 30)) this.call('retire');
    }
    if (p.flags.choosingPath && p.age < 21) {
      // 진로 갈림길을 기다리는 중
    } else if (!p.retired && !p.edu.school && p.age >= 15 && p.age < this.retireAge()) {
      delete p.flags.choosingPath;
      this.laborYear();
    }
    if (p.money.income > 0) {
      const saveRate = 0.03 + 0.17 * p.money.pct;
      p.money.cash += p.money.income * saveRate;
      this.addStat('happiness', (p.money.pct - 0.5) * 2);
    }
    if (p.money.debt > 0) {
      const pay = Math.min(p.money.debt, Math.max(0, p.money.cash) * 0.5);
      p.money.debt = p.money.debt * 1.05 - pay;
      p.money.cash -= pay;
    }
  }

  private retireAge(): number {
    const c = this.country;
    return c.income === 'HIC' || c.income === 'UMC' ? 65 : 70;
  }

  /**
   * 경제활동 상태와 구직. 해마다 일부가 경제활동을 떠나고 돌아오며(정상 상태 확률 = 보정된 참가율),
   * 경제활동 중이면서 일이 없는 사람은 일자리를 찾는다.
   */
  private laborYear(): void {
    const p = this.p, c = this.country;
    const cal = this.world.calibration(p.country);
    const share = laborShare(c, p.sex, cal.lfp[p.sex]);
    if (p.flags.outOfLabor === undefined) {
      p.flags.outOfLabor = !this.rng.chance(share);
    } else if (!p.flags.outOfLabor && this.rng.chance(LABOR_TURNOVER * (1 - share))) {
      p.flags.outOfLabor = true;
      if (p.job) {
        p.job = null;
        p.money.income = 0;
        this.log('sys.labor.leave', 'neutral');
      }
    } else if (p.flags.outOfLabor && this.rng.chance(LABOR_TURNOVER * share)) {
      p.flags.outOfLabor = false;
    }
    if (!p.flags.outOfLabor && !p.job && this.rng.chance(jobFindProb(p.age, cal.find))) this.call('job.seek');
  }

  private findJob(): JobDef | null {
    const p = this.p, c = this.country;
    const rank = EDU_LEVELS.indexOf(p.edu.level);
    const eligible = this.world.content.jobs.filter((j) => EDU_LEVELS.indexOf(j.minEdu) <= rank && (j.urban === undefined || j.urban === p.urban));
    // 농업 비중은 국가 통계, 나머지는 학력이 높을수록 고학력 일자리 선호
    const agriShare = c.agriEmployment * (p.urban ? 0.35 : 1.6);
    return this.rng.weighted(eligible, (j) => {
      const fit = 1 + 1.5 * EDU_LEVELS.indexOf(j.minEdu) * (rank >= 3 ? 1 : 0.3);
      return j.weight * fit * (j.sector === 'agri' ? agriShare * 10 : 1 - Math.min(0.95, agriShare));
    });
  }

  private startJob(j: JobDef): void {
    const p = this.p, c = this.country;
    p.job = j.id;
    p.jobYears = 0;
    // 직업 범위 안에서 지식·형편이 백분위 위치를 정한다
    const pos = clamp(0.5 + (p.stats.knowledge - 50) / 120 + (p.household - 3) * 0.06 + this.rng.normal() * 0.15, 0, 1);
    p.money.pct = j.pct[0] + (j.pct[1] - j.pct[0]) * pos;
    p.money.income = lognormalIncome(c.gdpPppPc * LABOR_SHARE, c.gini, p.money.pct);
    this.log('sys.job.start', 'neutral', { job: j.label }, ['work']);
  }

  // ── 가족 ──────────────────────────────────────────────────
  private familyYear(): void {
    const p = this.p, c = this.country;
    const kinDies = (k: Kin) => k.alive && this.rng.chance(this.world.qx(p.country, k.sex, k.age));
    const ageKin = (k: Kin) => { if (k.alive) k.age++; };
    for (const [who, k] of [['mother', p.family.mother], ['father', p.family.father]] as const) {
      if (kinDies(k)) { k.alive = false; this.log(`sys.family.${who}_died`, 'heavy', { age: k.age }, ['loss']); this.addStat('happiness', -12); }
      ageKin(k);
    }
    const pt = p.family.partner;
    if (pt) {
      if (kinDies(pt)) {
        pt.alive = false;
        if (pt.married) p.flags.widowed = true;
        p.family.partner = null;
        this.log('sys.family.partner_died', 'heavy', undefined, ['loss']);
        this.addStat('happiness', -18);
      }
      else ageKin(pt);
    }
    for (const kid of p.family.children) {
      if (kinDies(kid)) { kid.alive = false; this.log('sys.family.child_died', 'heavy', { age: kid.age }, ['loss']); this.addStat('happiness', -25); }
      ageKin(kid);
    }
    // 출산: 동반자가 있을 때 여성 쪽 나이의 연령별 출산율(WPP) × 국가 보정 배수.
    // 동반자가 없는 사람의 출산은 v0에서 다루지 않으므로 배수가 그만큼을 메운다.
    const motherAge = p.sex === 'F' ? p.age : p.family.partner?.age ?? 0;
    if (p.family.partner && motherAge >= 15 && motherAge <= 49) {
      const want = p.flags.noMoreKids ? 0.15 : 1;
      const pKid = clamp(c.asfr[Math.floor((motherAge - 15) / 5)] * this.world.calibration(p.country).fert * want, 0, 0.8);
      if (this.rng.chance(pKid)) {
        const sex = this.rng.chance(c.maleShare) ? 'M' : 'F';
        p.family.children.push({ age: 0, sex, alive: true });
        if (p.sex === 'F') p.flags.lastBirthYear = p.year;
        this.log(sex === 'F' ? 'sys.family.daughter_born' : 'sys.family.son_born', 'light', { n: p.family.children.length }, ['family', 'joy']);
        this.addStat('happiness', 8);
        this.addStat('relations', 5);
      }
    }
  }

  // ── DSL 사건 ─────────────────────────────────────────────
  private eligible(e: EventDef): boolean {
    const p = this.p;
    if (p.age < e.when.age[0] || p.age > e.when.age[1]) return false;
    if (e.id in p.done && (e.when.once || p.age - p.done[e.id] < e.when.cooldown)) return false;
    return e.when.if === undefined || !!run(e.when.if, this.scope());
  }

  private eventsYear(): DecisionDef | null {
    const p = this.p;
    let decision: DecisionDef | null = null;

    // 예약된 사건은 확률 없이 일어난다
    const due = p.scheduled.filter((s) => s.age <= p.age);
    p.scheduled = p.scheduled.filter((s) => s.age > p.age);
    for (const s of due) {
      const e = this.world.events.get(s.event);
      if (!e) continue;
      if (e.kind === 'decision') decision ??= this.openDecision(e);
      else this.fire(e);
    }

    const pool = this.shuffle(this.world.content.events.filter((e) => this.eligible(e)));
    let fired = 0;
    for (const e of pool) {
      if (e.kind === 'decision' && decision) continue;
      if (e.kind === 'happening' && fired >= MAX_HAPPENINGS) continue;
      if (!this.rng.chance(this.chance(e.chance, e.id))) continue;
      if (e.kind === 'decision') decision = this.openDecision(e);
      else { this.fire(e); fired++; }
    }
    return decision;
  }

  private shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }

  private fire(e: HappeningDef): void {
    this.p.done[e.id] = this.p.age;
    const s = this.scope();
    const o = this.rng.weighted(e.outcomes, (x) => Number(run(x.weight, s)));
    if (o) this.applyEffects(o.effects, e.tone);
  }

  private openDecision(e: DecisionDef): DecisionDef | null {
    const s = this.scope();
    const options = e.options.filter((o) => o.available === undefined || run(o.available, s)).map((o) => o.id);
    if (options.length < 2) return null;
    this.p.done[e.id] = this.p.age;
    this.p.pending = { event: e.id, options };
    return e;
  }

  /** 대기 중인 갈림길에서 선택지를 고른다. */
  choose(optionId: string): LogEntry[] {
    const p = this.p;
    if (!p.pending) throw new Error('기다리는 결정이 없음');
    if (!p.pending.options.includes(optionId)) throw new Error(`고를 수 없는 선택지 ${optionId}`);
    const e = this.world.events.get(p.pending.event) as DecisionDef;
    const o = e.options.find((x) => x.id === optionId)!;
    const from = p.log.length;
    // 결정은 이미 지난 해에 속한다
    const age = p.age, year = p.year;
    p.age = Math.max(0, p.age - 1); p.year--;
    p.pending = null;
    p.flags[`chose_${e.id}`] = optionId;
    const r = o.resolve;
    if (r.effects) this.applyEffects(r.effects, e.tone);
    if (r.chance) {
      const ok = this.rng.chance(this.chance(r.chance, `${e.id}.${o.id}`));
      const ef = ok ? r.success : r.fail;
      if (ef) this.applyEffects(ef, e.tone);
    }
    p.age = age; p.year = year;
    this.sync();
    return p.log.slice(from);
  }

  /** 자동 결정: auto 가중치로 고른다. */
  autoChoose(): string {
    const p = this.p;
    if (!p.pending) throw new Error('기다리는 결정이 없음');
    const e = this.world.events.get(p.pending.event) as DecisionDef;
    const s = this.scope();
    const id = this.rng.weighted(p.pending.options, (id) => Number(run(e.auto[id] ?? 0, s))) ?? p.pending.options[0];
    this.choose(id);
    return id;
  }

  private applyEffects(ef: EffectsDef, tone: Tone): void {
    const p = this.p;
    const s = this.scope();
    for (const [k, v] of Object.entries(ef.stats ?? {})) this.addStat(k as StatKey, Number(run(v, s)));
    if (ef.money?.cash !== undefined) p.money.cash += Number(run(ef.money.cash, s));
    if (ef.money?.debt !== undefined) p.money.debt = Math.max(0, p.money.debt + Number(run(ef.money.debt, s)));
    if (ef.money?.pct !== undefined && p.job) {
      p.money.pct = clamp(p.money.pct + Number(run(ef.money.pct, s)), 0.01, 0.995);
      p.money.income = lognormalIncome(this.country.gdpPppPc * LABOR_SHARE, this.country.gini, p.money.pct);
    }
    for (const [k, v] of Object.entries(ef.set ?? {})) p.flags[k] = run(v, s) as string | number | boolean;
    for (const k of ef.unset ?? []) delete p.flags[k];
    if (ef.edu) p.edu.level = ef.edu;
    if (ef.family?.partner && !p.family.partner) {
      const age = Math.round(clamp(p.age + (p.sex === 'F' ? 3 : -3) + this.rng.normal() * 3, 16, 90));
      p.family.partner = { age, sex: p.sex === 'F' ? 'M' : 'F', alive: true, married: false };
    }
    if (ef.family?.marry && p.family.partner) {
      p.family.partner.married = true;
      p.flags.everMarried = true;
      p.flags.marriedAge = p.age;
      delete p.flags.widowed;
    }
    if (ef.family?.divorce) p.family.partner = null;
    if (ef.condition?.add && !p.conditions.includes(ef.condition.add)) p.conditions.push(ef.condition.add);
    if (ef.condition?.remove) p.conditions = p.conditions.filter((x) => x !== ef.condition!.remove);
    if (ef.habit?.smoker !== undefined) p.habits.smoker = ef.habit.smoker;
    if (ef.schedule) p.scheduled.push({ event: ef.schedule.event, age: p.age + ef.schedule.in });
    if (ef.causeHint) p.causeHints[ef.causeHint.cause] = (p.causeHints[ef.causeHint.cause] ?? 1) * ef.causeHint.k;
    if (ef.log) this.log(ef.log, tone, undefined, ef.tags);
    for (const c of ([] as string[]).concat(ef.call ?? [])) this.call(c);
  }

  /** 엔진 내장 절차 */
  private call(name: string): void {
    const p = this.p;
    switch (name) {
      case 'job.seek': {
        // 갈림길·사건이 부른 구직도 경제활동 상태를 따른다 (그래야 참가율 보정이 유지된다)
        if (p.flags.outOfLabor === undefined) {
          const cal = this.world.calibration(p.country);
          p.flags.outOfLabor = !this.rng.chance(laborShare(this.country, p.sex, cal.lfp[p.sex]));
        }
        if (p.flags.outOfLabor) {
          this.log('sys.labor.home', 'neutral');
          return;
        }
        const j = this.findJob();
        if (j) this.startJob(j);
        return;
      }
      case 'job.quit':
        if (p.job) { p.job = null; p.money.income = 0; this.log('sys.job.quit', 'neutral'); }
        return;
      case 'school.tertiary':
        p.edu.school = { stage: 'tertiary', yearsLeft: 4 };
        if (p.job) { p.job = null; p.money.income = 0; }
        return;
      case 'school.graduate':
        p.edu.school = { stage: 'tertiary', yearsLeft: 2 };
        if (p.job) { p.job = null; p.money.income = 0; }
        return;
      case 'retire': {
        if (!p.job) return;
        const formal = this.world.jobs.get(p.job)?.formal;
        const c = this.country;
        p.retired = true;
        p.job = null;
        // 공적 연금: 정규직이고 중소득 이상 국가일 때만 (v0 단순화)
        p.money.income = formal && (c.income === 'HIC' || c.income === 'UMC') ? p.money.income * 0.45 : 0;
        this.log('sys.job.retire', 'light', undefined, ['milestone']);
        return;
      }
      case 'school.leave':
        if (p.edu.school) { p.edu.school = null; this.log('sys.school.left', 'heavy'); }
        return;
      case 'move.city':
        if (!p.urban) { p.urban = true; this.log('sys.move.city', 'neutral'); }
        return;
      default:
        throw new Error(`알 수 없는 내장 절차 ${name}`);
    }
  }

  // ── 죽음 ──────────────────────────────────────────────────
  private deathCheck(): boolean {
    const p = this.p, c = this.country;
    const q = this.world.qx(p.country, p.sex, p.age);
    const m = mortalityMultiplier(p, c, this.world.calibration(p.country));
    this.observe?.({ type: 'mortality', age: p.age, sex: p.sex, raw: rawMortalityMultiplier(p, c) });
    const pDie = deathProbability(q, m);
    if (!this.rng.chance(pDie)) return false;
    const cause = drawCause(p, c, this.rng, this.world.calibration(p.country));
    p.dead = { age: p.age, year: p.year, cause };
    const sensitive = SENSITIVE_CAUSES.includes(cause);
    this.log(`sys.death.${cause}`, sensitive ? 'sensitive' : 'heavy', { age: p.age }, ['death']);
    // 장면은 그리지 않고 도움받을 곳을 함께 남긴다
    if (cause === 'suicide') this.log('sys.help.suicide', 'sensitive');
    return true;
  }

  /** 자동으로 끝까지 산다 (테스트·시뮬레이션용) */
  liveOut(maxYears = 130): this {
    for (let i = 0; i < maxYears && !this.p.dead; i++) {
      this.step({ autoFocus: true });
      if (this.p.pending) this.autoChoose();
    }
    return this;
  }
}
