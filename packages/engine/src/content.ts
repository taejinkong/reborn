// 콘텐츠 DSL 스키마 (docs/03-event-dsl.md 의 v0 구현).
import { z } from 'zod';
import { parse, refs, type Node } from './expr.ts';

const Expr = z.union([z.string(), z.number(), z.boolean()]);
export const STAT_KEYS = ['health', 'happiness', 'knowledge', 'relations'] as const;
export const EDU_LEVELS = ['none', 'primary', 'secondary', 'tertiary', 'graduate'] as const;
export const TONES = ['light', 'neutral', 'heavy', 'sensitive'] as const;

const OddsTerm = z.union([
  z.object({ by: z.string(), beta: z.number(), center: z.number() }).strict(),
  z.object({ if: Expr, x: z.number().positive() }).strict(),
]);

export const Chance = z.union([
  Expr,
  z.object({
    base: Expr,
    odds: z.array(OddsTerm).default([]),
    normalize: z.boolean().default(true),
  }).strict(),
]);

export const Effects = z.object({
  stats: z.record(z.enum(STAT_KEYS), Expr).optional(),
  money: z.object({ cash: Expr.optional(), debt: Expr.optional(), pct: Expr.optional() }).strict().optional(),
  set: z.record(z.string(), Expr).optional(),
  unset: z.array(z.string()).optional(),
  edu: z.enum(EDU_LEVELS).optional(),
  /** 엔진 내장 절차 호출 (예: job.seek) */
  call: z.union([z.string(), z.array(z.string())]).optional(),
  family: z.object({
    partner: z.boolean().optional(),
    marry: z.boolean().optional(),
    divorce: z.boolean().optional(),
  }).strict().optional(),
  condition: z.object({ add: z.string().optional(), remove: z.string().optional() }).strict().optional(),
  habit: z.object({ smoker: z.boolean().optional() }).strict().optional(),
  schedule: z.object({ event: z.string(), in: z.number().int().positive() }).strict().optional(),
  /** 사망 원인 가중치 보정. 사건은 직접 죽이지 않고 원인 분포만 바꾼다. */
  causeHint: z.object({ cause: z.string(), k: z.number().positive() }).strict().optional(),
  /** 재산 옮기기 (PPP 달러, 양수면 현금에서 넣고 음수면 꺼내 현금으로). home·property는 사고팔 때 대출과 함께 계산 */
  finance: z.object({
    deposit: Expr.optional(),
    stocks: Expr.optional(),
    repay: Expr.optional(),
    buyHome: z.boolean().optional(),
    sellHome: z.boolean().optional(),
    buyProperty: z.boolean().optional(),
    sellProperty: z.boolean().optional(),
    saveRate: Expr.optional(),
  }).strict().optional(),
  /** 물건 사기·팔기 (물건 id) */
  buy: z.string().optional(),
  sell: z.string().optional(),
  log: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).strict();

const When = z.object({
  age: z.tuple([z.number(), z.number()]),
  once: z.boolean().default(true),
  if: Expr.optional(),
  /** once=false일 때 다시 일어나기까지 최소 연수 */
  cooldown: z.number().int().nonnegative().default(0),
}).strict();

const Tone = z.enum(TONES).default('neutral');

export const Happening = z.object({
  id: z.string(),
  kind: z.literal('happening'),
  category: z.string(),
  when: When,
  chance: Chance,
  outcomes: z.array(z.object({ weight: Expr.default(1), effects: Effects }).strict()).min(1),
  tone: Tone,
  source: z.array(z.string()).default([]),
}).strict();

export const Resolve = z.object({
  chance: Chance.optional(),
  success: Effects.optional(),
  fail: Effects.optional(),
  effects: Effects.optional(),
}).strict();

export const Decision = z.object({
  id: z.string(),
  kind: z.literal('decision'),
  category: z.string(),
  when: When,
  chance: Chance.default(1),
  title: z.string(),
  body: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    available: Expr.optional(),
    hint: z.string().optional(),
    resolve: Resolve,
  }).strict()).min(2),
  auto: z.record(z.string(), Expr),
  tone: Tone,
  source: z.array(z.string()).default([]),
}).strict();

export const Focus = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  age: z.tuple([z.number(), z.number()]),
  if: Expr.optional(),
  stats: z.record(z.enum(STAT_KEYS), z.number()),
  /** 자동 결정 모드의 선택 가중치 */
  auto: Expr.default(1),
}).strict();

export const Job = z.object({
  id: z.string(),
  label: z.string(),
  sector: z.enum(['agri', 'industry', 'service', 'public']),
  minEdu: z.enum(EDU_LEVELS),
  /** 국가 소득분포에서의 백분위 범위 */
  pct: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  /** 상대 일자리 수 */
  weight: z.number().positive().default(1),
  urban: z.boolean().optional(),
  formal: z.boolean().default(true),
  /** 이 직업이 있는 곳 (없으면 어디에나) */
  where: z.object({
    regions: z.array(z.enum(['eap', 'eca', 'lac', 'mena', 'na', 'sa', 'ssa'])).optional(),
    income: z.array(z.enum(['LIC', 'LMC', 'UMC', 'HIC'])).optional(),
  }).strict().optional(),
  /** 이 일을 하는 동안 사망 원인 가중치 배수 (예: { injury: 1.5 }) */
  risks: z.record(z.string(), z.number().positive()).optional(),
}).strict();

/** 살 수 있는 물건. 값은 PPP 달러. */
export const Item = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  price: Expr,
  minAge: z.number().default(0),
  available: Expr.optional(),
  /** 산 순간의 행복 */
  joy: z.number().default(0),
  /** 가지고 있는 동안 해마다의 상태값 변화 */
  yearly: z.record(z.enum(STAT_KEYS), z.number()).default({}),
  /** 해마다 드는 유지비 (가격 대비 비율) */
  upkeep: z.number().min(0).default(0),
  /** 쓸 수 있는 햇수 (지나면 낡아서 없어진다) */
  life: z.number().int().positive().default(99),
  /** 팔 때 받는 값 (가격 대비, 해마다 줄어든다) */
  resale: z.number().min(0).max(1).default(0.3),
}).strict();

/** 플레이어가 원할 때 고르는 행동 */
export const Action = z.object({
  id: z.string(),
  kind: z.literal('action'),
  category: z.enum(['money', 'items', 'career', 'love', 'health', 'life']),
  label: z.string(),
  hint: z.string().optional(),
  available: Expr.default(true),
  /** 다시 할 수 있기까지 햇수 */
  cooldown: z.number().int().nonnegative().default(0),
  /** 금액을 고르는 행동: 기준 금액(식)의 몇 %까지 */
  amount: z.object({ of: Expr, min: z.number().min(0).max(1).default(0.1), max: z.number().min(0).max(1).default(1) }).strict().optional(),
  resolve: z.lazy(() => Resolve),
  tone: Tone,
  source: z.array(z.string()).default([]),
}).strict();

export type HappeningDef = z.infer<typeof Happening>;
export type DecisionDef = z.infer<typeof Decision>;
export type EventDef = HappeningDef | DecisionDef;
export type EffectsDef = z.infer<typeof Effects>;
export type ChanceDef = z.infer<typeof Chance>;
export type FocusDef = z.infer<typeof Focus>;
export type JobDef = z.infer<typeof Job>;
export type ItemDef = z.infer<typeof Item>;
export type ActionDef = z.infer<typeof Action>;

export const ContentBundle = z.object({
  events: z.array(z.union([Happening, Decision])),
  focus: z.array(Focus),
  jobs: z.array(Job),
  items: z.array(Item).default([]),
  actions: z.array(Action).default([]),
  i18n: z.record(z.string(), z.record(z.string(), z.string())),
});
export type Content = z.infer<typeof ContentBundle>;

/** 표현식이 쓸 수 있는 최상위 이름과 함수 (린트 기준) */
export const SCOPE_ROOTS = ['age', 'sex', 'year', 'stats', 'money', 'edu', 'job', 'family', 'flags', 'country', 'household', 'urban', 'habits', 'focus', 'retired', 'migrant', 'rates', 'jobSector', 'owns', 'amount', 'prices'];
export const SCOPE_FNS = ['has', 'clamp', 'min', 'max', 'rand', 'did', 'pct', 'owned'];

/** 콘텐츠 검증. 문제 목록을 돌려준다(빈 배열이면 통과). */
export function lintContent(c: Content): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const keys = c.i18n.ko ?? {};
  const needKey = (where: string, k?: string) => {
    if (k && !(k in keys)) errs.push(`${where}: i18n 키 없음 '${k}'`);
  };
  const checkExpr = (where: string, e: unknown) => {
    if (typeof e !== 'string') return;
    let n: Node;
    try {
      n = parse(e);
    } catch (err) {
      errs.push(`${where}: ${(err as Error).message}`);
      return;
    }
    const r = refs(n);
    for (const p of r.paths) if (!SCOPE_ROOTS.includes(p.split('.')[0])) errs.push(`${where}: 알 수 없는 경로 '${p}'`);
    for (const f of r.fns) if (!SCOPE_FNS.includes(f)) errs.push(`${where}: 알 수 없는 함수 '${f}()'`);
  };
  const checkChance = (where: string, ch: ChanceDef | undefined) => {
    if (ch === undefined) return;
    if (typeof ch !== 'object') return checkExpr(where, ch);
    checkExpr(`${where}.base`, ch.base);
    ch.odds.forEach((o, i) => ('if' in o ? checkExpr(`${where}.odds[${i}]`, o.if) : checkExpr(`${where}.odds[${i}]`, o.by)));
  };
  const checkEffects = (where: string, ef: EffectsDef | undefined) => {
    if (!ef) return;
    Object.entries(ef.stats ?? {}).forEach(([k, v]) => checkExpr(`${where}.stats.${k}`, v));
    Object.entries(ef.set ?? {}).forEach(([k, v]) => checkExpr(`${where}.set.${k}`, v));
    if (ef.money) Object.entries(ef.money).forEach(([k, v]) => checkExpr(`${where}.money.${k}`, v));
    needKey(where, ef.log);
    if (ef.schedule && !c.events.some((e) => e.id === ef.schedule!.event)) errs.push(`${where}: 예약 대상 없음 '${ef.schedule.event}'`);
    if (ef.finance) Object.entries(ef.finance).forEach(([k, v]) => checkExpr(`${where}.finance.${k}`, v));
    for (const id of [ef.buy, ef.sell]) if (id && !c.items.some((it) => it.id === id)) errs.push(`${where}: 없는 물건 '${id}'`);
  };

  for (const e of c.events) {
    if (ids.has(e.id)) errs.push(`${e.id}: 중복 id`);
    ids.add(e.id);
    checkExpr(`${e.id}.when.if`, e.when.if);
    checkChance(`${e.id}.chance`, e.chance);
    if (e.when.age[0] > e.when.age[1]) errs.push(`${e.id}: 나이 범위 역전`);
    if (e.kind === 'happening') {
      e.outcomes.forEach((o, i) => { checkExpr(`${e.id}.outcomes[${i}].weight`, o.weight); checkEffects(`${e.id}.outcomes[${i}]`, o.effects); });
    } else {
      needKey(e.id, e.title);
      needKey(e.id, e.body);
      const optIds = e.options.map((o) => o.id);
      for (const o of e.options) {
        const w = `${e.id}.${o.id}`;
        needKey(w, o.label);
        needKey(w, o.hint);
        checkExpr(`${w}.available`, o.available);
        checkChance(`${w}.chance`, o.resolve.chance);
        checkEffects(`${w}.success`, o.resolve.success);
        checkEffects(`${w}.fail`, o.resolve.fail);
        checkEffects(`${w}.effects`, o.resolve.effects);
        if (o.resolve.chance && !o.resolve.success && !o.resolve.fail) errs.push(`${w}: chance가 있으면 success/fail 필요`);
      }
      for (const k of Object.keys(e.auto)) if (!optIds.includes(k)) errs.push(`${e.id}.auto: 없는 선택지 '${k}'`);
      for (const [k, v] of Object.entries(e.auto)) checkExpr(`${e.id}.auto.${k}`, v);
    }
    if (e.tone === 'sensitive' && !e.source.length) errs.push(`${e.id}: sensitive 사건은 source 필요`);
  }
  for (const f of c.focus) { needKey(`focus.${f.id}`, f.label); needKey(`focus.${f.id}`, f.hint); checkExpr(`focus.${f.id}.if`, f.if); checkExpr(`focus.${f.id}.auto`, f.auto); }
  for (const j of c.jobs) needKey(`job.${j.id}`, j.label);
  const seen = new Set<string>();
  for (const it of c.items) {
    if (seen.has(it.id)) errs.push(`item.${it.id}: 중복 id`);
    seen.add(it.id);
    needKey(`item.${it.id}`, it.label);
    needKey(`item.${it.id}`, it.hint);
    checkExpr(`item.${it.id}.price`, it.price);
    checkExpr(`item.${it.id}.available`, it.available);
  }
  for (const a of c.actions) {
    if (ids.has(a.id) || seen.has(a.id)) errs.push(`${a.id}: 중복 id`);
    seen.add(a.id);
    needKey(a.id, a.label);
    needKey(a.id, a.hint);
    checkExpr(`${a.id}.available`, a.available);
    if (a.amount) checkExpr(`${a.id}.amount.of`, a.amount.of);
    checkChance(`${a.id}.chance`, a.resolve.chance);
    checkEffects(`${a.id}.success`, a.resolve.success);
    checkEffects(`${a.id}.fail`, a.resolve.fail);
    checkEffects(`${a.id}.effects`, a.resolve.effects);
  }
  return errs;
}
