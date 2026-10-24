// 한 사람의 삶을 1년 단위로 진행한다.
import { bornPerson, type BirthOptions } from './birth.ts';
import type { ActionDef, ChanceDef, DecisionDef, EffectsDef, EventDef, FocusDef, HappeningDef, ItemDef, JobDef } from './content.ts';
import { EDU_LEVELS } from './content.ts';
import { housePrice, type Country } from './data.ts';
import { compile, type Expr, type Scope } from './expr.ts';
import { clamp, lognormalIncome, oddsNormalizer, scaleOdds } from './math.ts';
import { jobFindProb, laborShare, personRates } from './calibration.ts';
import { SENSITIVE_CAUSES, deathProbability, drawCause, expectedHealth, mortalityMultiplier, rawMortalityMultiplier } from './mortality.ts';
import { Rng } from './rng.ts';
import type { Kin, LogEntry, Money, Person, StatKey, Tone } from './state.ts';
import type { World } from './world.ts';

/** 연간 무작위 사건 최대 개수 */
const MAX_HAPPENINGS = 3;
/** 1년 실제 시간 하한·상한(초) */
const YEAR_SEC = [12, 120] as const;
/** 노동소득이 1인당 GDP에서 차지하는 비율 (근사) */
const LABOR_SHARE = 0.6;
/** 경제활동 상태를 해마다 다시 정하는 비율 */
const LABOR_TURNOVER = 0.15;
/** 첫 세대 이주자의 소득 순위 불이익 (직업 범위 안 위치, 추정) */
const MIGRANT_PAY_GAP = 0.15;
/** 임대 부동산의 순 임대수익률 (추정) */
const RENT_YIELD = 0.04;
/** 주식(지수펀드) 실질 기대수익률과 변동성 (소득그룹별 추정) */
const MARKET = { HIC: [0.045, 0.17], UMC: [0.05, 0.22], LMC: [0.055, 0.25], LIC: [0.05, 0.28] } as const;
/** 투자 부동산 가격 (집값 대비) */
const PROPERTY_K = 0.6;

/** 옛 저장본에 없는 필드를 채운다 */
function normalize(p: Person): Person {
  const old = p.money as Partial<Money> & Pick<Money, 'cash' | 'debt' | 'income' | 'pct'>;
  p.money = { deposit: 0, stocks: 0, home: 0, property: 0, saveRate: null, ...old };
  p.owns ??= {};
  p.acted ??= {};
  return p;
}

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
export type Observation = { type: 'mortality'; age: number; sex: 'F' | 'M'; country: string; raw: number };

export class Life {
  readonly world: World;
  readonly p: Person;
  private rng: Rng;
  /** 보정·분석용 관찰 콜백 (게임 진행에는 영향 없음) */
  observe?: (o: Observation) => void;

  constructor(world: World, person: Person) {
    this.world = world;
    this.p = normalize(person);
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
        money: { ...p.money, netWorth: this.netWorth(), saveRateNow: p.money.saveRate ?? this.defaultSaveRate() },
        owns: p.owns,
        amount: this.pendingAmount,
        prices: { home: housePrice(c, p.urban), property: housePrice(c, p.urban) * PROPERTY_K },
        edu: { level: p.edu.level, rank: EDU_LEVELS.indexOf(p.edu.level), inSchool: !!p.edu.school, stage: p.edu.school?.stage ?? null },
        job: p.job,
        jobSector: p.job ? this.world.jobs.get(p.job)?.sector ?? null : null,
        family: {
          partner: !!p.family.partner,
          partnerAge: p.family.partner?.age ?? 0,
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
        rates: personRates(p, c, this.world.calibration(p.country), this.world.country(p.born), this.world.calibration(p.born)),
      },
      fns: {
        has: (id) => p.conditions.includes(id as string),
        owned: (id) => (id as string) in p.owns,
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
    this.financeYear(!!opts.autoFocus);
    this.familyYear();
    const decision = this.eventsYear();
    const died = this.deathCheck();
    if (died) p.pending = null;

    p.history.push({
      age: p.age, year: p.year, stats: { ...p.stats }, income: Math.round(p.money.income),
      cash: Math.round(p.money.cash), netWorth: Math.round(this.netWorth()), focus: p.focus, edu: p.edu.level, job: p.job,
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
  }

  // ── 재산 ──────────────────────────────────────────────────
  /** 형편에 맞는 기본 저축률 */
  defaultSaveRate(): number {
    return 0.03 + 0.17 * this.p.money.pct;
  }

  netWorth(): number {
    const m = this.p.money;
    return m.cash + m.deposit + m.stocks + m.home + m.property - m.debt;
  }

  itemPrice(it: ItemDef): number {
    return Math.max(0, Number(run(it.price, this.scope())));
  }

  /** 올해의 주식시장 수익률 (로그 수익률, 실질). 드물게 폭락이 끼어든다 */
  private marketReturn(): number {
    const [mu, sigma] = MARKET[this.country.income];
    let r = mu - (sigma * sigma) / 2 + sigma * this.rng.normal();
    if (this.rng.chance(0.04)) r -= 0.25;
    return r;
  }

  private financeYear(auto: boolean): void {
    const p = this.p, c = this.country, m = p.money;
    // 저축: 소득 중 저축률만큼 남는다. 기본보다 많이 쓰면 그만큼 행복이 조금 오르고, 아끼면 조금 내린다
    if (m.income > 0) {
      const base = this.defaultSaveRate();
      const rate = m.saveRate ?? base;
      m.cash += m.income * rate;
      this.addStat('happiness', (m.pct - 0.5) * 2 + (base - rate) * 15);
    }
    // 물건: 유지비와 해마다의 효과. 수명이 다하면 없어진다
    for (const [id, boughtAt] of Object.entries(p.owns)) {
      const it = this.world.items.get(id);
      if (!it) { delete p.owns[id]; continue; }
      if (p.age - boughtAt >= it.life) {
        delete p.owns[id];
        this.log('sys.item.worn', 'neutral', { item: it.label });
        continue;
      }
      m.cash -= this.itemPrice(it) * it.upkeep;
      for (const [k, d] of Object.entries(it.yearly)) this.addStat(k as StatKey, d);
    }
    // 수익: 예금은 실질 금리, 주식은 시장 수익률, 집값은 완만하게 오르내린다
    m.deposit *= 1 + clamp(c.depositRate - c.inflation, -0.15, 0.08);
    const market = this.marketReturn();
    p.flags.market = Math.round(market * 1000) / 1000;
    if (m.stocks > 0) {
      m.stocks *= Math.exp(market);
      if (market < -0.2) this.log('sys.market.crash', 'neutral', undefined, ['money', 'setback']);
      else if (market > 0.22) this.log('sys.market.boom', 'light', undefined, ['money', 'luck']);
    }
    const house = 0.01 + this.rng.normal() * 0.05;
    m.home *= Math.exp(house);
    m.property *= Math.exp(house + this.rng.normal() * 0.02);
    m.cash += m.property * RENT_YIELD;
    // 빚: 실질 대출 금리로 불어나고, 남는 현금의 절반으로 갚는다
    if (m.debt > 0) {
      m.debt *= 1 + clamp(c.lendingRate - c.inflation, 0.02, 0.3);
      const pay = Math.min(m.debt, Math.max(0, m.cash) * 0.5);
      m.debt -= pay;
      m.cash -= pay;
      if (m.debt < 1) m.debt = 0;
    }
    // 현금이 모자라면 예금 → 주식 순서로 헐고, 그래도 모자라면 빚
    if (m.cash < 0) {
      for (const k of ['deposit', 'stocks'] as const) {
        const take = Math.min(m[k], -m.cash);
        m[k] -= take;
        m.cash += take;
      }
      if (m.cash < 0) { m.debt -= m.cash; m.cash = 0; }
    }
    // 감당할 수 없는 빚이면 부동산을 처분한다
    const limit = Math.max(m.income, c.gdpPppPc * 0.5) * 8;
    if (m.debt > limit && (m.property > 0 || m.home > 0)) {
      for (const k of ['property', 'home'] as const) {
        if (m.debt <= limit) break;
        m.debt -= m[k] * 0.9;
        m[k] = 0;
      }
      if (m.debt < 0) { m.cash -= m.debt; m.debt = 0; }
      delete p.flags.homeowner;
      this.log('sys.money.foreclosure', 'heavy', undefined, ['money', 'loss']);
      this.addStat('happiness', -10);
    }
    if (auto) this.autoInvest();
  }

  /** 자동 결정 모드의 돈 습관: 쓸 돈을 남기고 나머지를 예금·주식에 나눠 둔다 */
  private autoInvest(): void {
    const p = this.p, c = this.country, m = p.money;
    if (p.age < 22) return;
    if (m.debt > 0 && m.deposit > 0) {
      const pay = Math.min(m.debt, m.deposit);
      m.debt -= pay;
      m.deposit -= pay;
    }
    const buffer = Math.max(m.income * 0.5, c.gdpPppPc * 0.2);
    const extra = m.cash - buffer;
    if (extra <= 0) return;
    const stockOk = (c.income === 'HIC' || c.income === 'UMC') && p.stats.knowledge > 45 && p.age < 70;
    if (stockOk) {
      m.stocks += extra * 0.5;
      m.deposit += extra * 0.3;
      m.cash -= extra * 0.8;
    } else {
      m.deposit += extra * 0.6;
      m.cash -= extra * 0.6;
    }
    // 나이가 들면 주식을 조금씩 예금으로 옮긴다
    if (p.age >= 70 && m.stocks > 0) {
      const move = m.stocks * 0.2;
      m.stocks -= move;
      m.deposit += move;
    }
  }

  // ── 행동 (플레이어가 원할 때) ──────────────────────────────
  private pendingAmount = 0;

  /** 지금 할 수 있는 행동 */
  availableActions(): ActionDef[] {
    const p = this.p;
    if (p.dead || p.pending) return [];
    const s = this.scope();
    return this.world.content.actions.filter((a) => {
      const last = p.acted[a.id];
      if (last !== undefined && a.cooldown > 0 && p.age - last < a.cooldown) return false;
      return !!run(a.available, s);
    });
  }

  /** 행동의 금액 범위 [최소, 최대] (금액을 고르는 행동만) */
  actionRange(a: ActionDef): [number, number] | null {
    if (!a.amount) return null;
    const base = Math.max(0, Number(run(a.amount.of, this.scope())));
    return [base * a.amount.min, base * a.amount.max];
  }

  /** 행동을 한다. amount는 금액을 고르는 행동에서 고른 금액(PPP 달러) */
  act(id: string, amount?: number): LogEntry[] {
    const p = this.p;
    const a = this.availableActions().find((x) => x.id === id);
    if (!a) throw new Error(`지금 할 수 없는 행동 ${id}`);
    const from = p.log.length;
    const range = this.actionRange(a);
    this.pendingAmount = range ? clamp(amount ?? range[1], range[0], range[1]) : 0;
    p.acted[id] = p.age;
    const r = a.resolve;
    if (r.effects) this.applyEffects(r.effects, a.tone);
    if (r.chance) {
      const ok = this.rng.chance(this.chance(r.chance, a.id));
      const ef = ok ? r.success : r.fail;
      if (ef) this.applyEffects(ef, a.tone);
    }
    this.pendingAmount = 0;
    this.sync();
    return p.log.slice(from);
  }

  private moveMoney(k: 'deposit' | 'stocks', amt: number): void {
    const m = this.p.money;
    if (amt > 0) {
      const x = Math.min(amt, Math.max(0, m.cash));
      m.cash -= x;
      m[k] += x;
    } else if (amt < 0) {
      const x = Math.min(-amt, m[k]);
      m[k] -= x;
      m.cash += x;
    }
  }

  /** 집·부동산을 산다. 계약금이 모자라면 사지 못한다 (false) */
  private buyRealEstate(kind: 'home' | 'property'): boolean {
    const p = this.p, m = p.money;
    const price = housePrice(this.country, p.urban) * (kind === 'home' ? 1 : PROPERTY_K);
    const down = price * (kind === 'home' ? 0.2 : 0.3);
    if (m.cash < down) return false;
    const pay = Math.min(m.cash, price);
    m.cash -= pay;
    m.debt += price - pay;
    m[kind] += price;
    if (kind === 'home') p.flags.homeowner = true;
    return true;
  }

  /** 다른 나라로 옮긴다. 일은 그만두고, 경제활동 상태는 새 나라 기준으로 다시 정한다. */
  private moveTo(id: string): void {
    const p = this.p;
    p.country = id;
    p.urban = true;
    if (p.job) { p.job = null; p.money.income = 0; }
    delete p.flags.outOfLabor;
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
    const eligible = this.world.content.jobs.filter((j) =>
      EDU_LEVELS.indexOf(j.minEdu) <= rank &&
      (j.urban === undefined || j.urban === p.urban) &&
      (!j.where?.regions || j.where.regions.includes(c.region)) &&
      (!j.where?.income || j.where.income.includes(c.income)));
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
    // 첫 세대 이주자는 같은 조건이라도 소득 순위가 낮게 시작한다 (추정)
    const migrantGap = p.country !== p.born ? MIGRANT_PAY_GAP : 0;
    const pos = clamp(0.5 + (p.stats.knowledge - 50) / 120 + (p.household - 3) * 0.06 - migrantGap + this.rng.normal() * 0.15, 0, 1);
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
      const want = p.flags.noMoreKids ? 0.15 : p.flags.wantKids ? 2 : 1;
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
    if (ef.finance) {
      const f = ef.finance, m = p.money;
      if (f.deposit !== undefined) this.moveMoney('deposit', Number(run(f.deposit, s)));
      if (f.stocks !== undefined) this.moveMoney('stocks', Number(run(f.stocks, s)));
      if (f.repay !== undefined) {
        const x = Math.min(Number(run(f.repay, s)), Math.max(0, m.cash), m.debt);
        m.cash -= x;
        m.debt -= x;
      }
      if (f.buyHome) this.buyRealEstate('home');
      if (f.buyProperty) this.buyRealEstate('property');
      if (f.sellHome && m.home > 0) { m.cash += m.home * 0.97; m.home = 0; delete p.flags.homeowner; }
      if (f.sellProperty && m.property > 0) { m.cash += m.property * 0.95; m.property = 0; }
      if (f.saveRate !== undefined) {
        const v = Number(run(f.saveRate, s));
        m.saveRate = v < 0 ? null : clamp(v, 0, 0.6);
      }
    }
    if (ef.buy && !(ef.buy in p.owns)) {
      const it = this.world.items.get(ef.buy)!;
      p.money.cash -= this.itemPrice(it);
      p.owns[ef.buy] = p.age;
      this.addStat('happiness', it.joy);
      this.log('sys.item.bought', 'light', { item: it.label }, ['money']);
    }
    if (ef.sell && ef.sell in p.owns) {
      const it = this.world.items.get(ef.sell)!;
      const used = Math.max(0, 1 - (p.age - p.owns[ef.sell]) / it.life);
      p.money.cash += this.itemPrice(it) * it.resale * used;
      delete p.owns[ef.sell];
      this.log('sys.item.sold', 'neutral', { item: it.label }, ['money']);
    }
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
      case 'migrate.work':
      case 'migrate.flee': {
        const born = this.world.country(p.born);
        const dests = born.destinations.filter(([id]) => this.world.byId.has(id) && id !== p.country);
        const dest = this.rng.weighted(dests, ([, w]) => w)?.[0];
        if (!dest) return;
        const refugee = name === 'migrate.flee';
        this.moveTo(dest);
        p.flags.refugee = refugee;
        p.flags.migratedAge = p.age;
        if (refugee) {
          p.money.cash *= 0.3;
          this.addStat('health', -4);
          this.addStat('happiness', -12);
          this.addStat('relations', -6);
          this.log('sys.migrate.flee', 'heavy', { country: dest }, ['migration', 'loss']);
        } else {
          this.addStat('relations', -5);
          this.log('sys.migrate.work', 'neutral', { country: dest }, ['migration', 'new_start']);
          if (p.age >= 15 && !p.edu.school) this.call('job.seek');
        }
        return;
      }
      case 'migrate.return':
        if (p.country === p.born) return;
        this.moveTo(p.born);
        delete p.flags.refugee;
        this.addStat('relations', 4);
        this.log('sys.migrate.return', 'neutral', { country: p.born }, ['migration']);
        if (p.age >= 15 && !p.edu.school && !p.retired) this.call('job.seek');
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
    this.observe?.({ type: 'mortality', age: p.age, sex: p.sex, country: p.country, raw: rawMortalityMultiplier(p, c) });
    const pDie = deathProbability(q, m);
    if (!this.rng.chance(pDie)) return false;
    const risks = p.job ? this.world.jobs.get(p.job)?.risks : undefined;
    const cause = drawCause(p, c, this.rng, this.world.calibration(p.country), risks);
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
