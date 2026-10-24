import { describe, expect, it } from 'vitest';
import { birthOdds } from '../src/birth.ts';
import { lintContent } from '../src/content.ts';
import { Life } from '../src/life.ts';
import { lognormalIncome, oddsNormalizer, scaleOdds } from '../src/math.ts';
import { Rng } from '../src/rng.ts';
import { format, render } from '../src/text.ts';
import { loadWorld } from './world.ts';
import { e0Of, measureCountry, rate, tfrOf } from '../../../scripts/measure.ts';

const world = loadWorld();

describe('난수', () => {
  it('같은 시드는 같은 수열', () => {
    const a = new Rng('x'), b = new Rng('x');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
  it('상태 복원', () => {
    const a = new Rng('y');
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
});

describe('수학', () => {
  it('오즈 정규화: 형편 분포 평균이 기준값', () => {
    const f = [1, 2, 3, 4, 5].map((h) => Math.exp(0.6 * (h - 3)));
    const n = oddsNormalizer(0.3, f);
    const mean = f.reduce((s, x) => s + scaleOdds(0.3, n * x), 0) / 5;
    expect(mean).toBeCloseTo(0.3, 4);
  });
  it('로그정규 소득의 평균은 지정한 평균에 가깝다', () => {
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) s += lognormalIncome(30000, 0.35, (i + 0.5) / N);
    expect(s / N / 30000).toBeGreaterThan(0.95);
    expect(s / N / 30000).toBeLessThan(1.05);
  });
});

describe('콘텐츠', () => {
  it('린트 통과', () => {
    expect(lintContent(world.content)).toEqual([]);
  });
  it('조사 처리', () => {
    expect(format('{x|이/가}', { x: '인도' })).toBe('인도가');
    expect(format('{x|이/가}', { x: '한국' })).toBe('한국이');
    expect(format('{x|으로/로}', { x: '교사' })).toBe('교사로');
    expect(format('{x|으로/로}', { x: '간호사' })).toBe('간호사로');
    expect(format('{x|으로/로}', { x: '공장 노동자' })).toBe('공장 노동자로');
    expect(format('{x|으로/로}', { x: '요리사' })).toBe('요리사로');
    expect(format('{x|으로/로}', { x: '경찰관' })).toBe('경찰관으로');
    expect(format('{x|으로/로}', { x: '작은 가게 주인' })).toBe('작은 가게 주인으로');
  });
});

describe('출생', () => {
  it('출생아 수 비율대로 국가를 뽑는다', () => {
    const N = 20000, counts: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const l = Life.born(world, { seed: `b${i}` });
      counts[l.p.born] = (counts[l.p.born] ?? 0) + 1;
    }
    for (const id of ['IND', 'NGA', 'CHN']) {
      const expected = birthOdds(world, world.country(id));
      expect(Math.abs(counts[id] / N - expected)).toBeLessThan(0.01);
    }
  });
});

describe('삶', () => {
  it('같은 시드와 같은 선택이면 같은 삶', () => {
    const a = Life.born(world, { seed: 'same' }).liveOut();
    const b = Life.born(world, { seed: 'same' }).liveOut();
    expect(a.p.log).toEqual(b.p.log);
    expect(a.p.dead).toEqual(b.p.dead);
  });
  it('직렬화 후 이어서 살아도 같다', () => {
    const a = Life.born(world, { seed: 'resume' });
    for (let i = 0; i < 20 && a.alive; i++) { a.step({ autoFocus: true }); if (a.p.pending) a.autoChoose(); }
    const b = new Life(world, JSON.parse(JSON.stringify(a.p)));
    a.liveOut();
    b.liveOut();
    expect(b.p.dead).toEqual(a.p.dead);
  });
  it('모든 기록 문장이 번역된다', () => {
    for (let i = 0; i < 300; i++) {
      const l = Life.born(world, { seed: `t${i}` }).liveOut();
      for (const e of l.p.log) {
        const s = render(world, e);
        expect(s, e.key).not.toMatch(/^sys\.|^ev\.|^dec\.|\{\w+\}/);
      }
    }
  });
});

describe('재산과 행동', () => {
  const adult = (id = 'KOR') => {
    const l = Life.born(world, { seed: `money:${id}`, country: id, sex: 'F' });
    l.p.age = 30;
    l.p.money.cash = 100_000;
    l.p.money.income = 40_000;
    return l;
  };
  it('예금은 실질 금리만큼 불어난다', () => {
    const l = adult();
    l.act('act.deposit.put', 50_000);
    expect(l.p.money.deposit).toBe(50_000);
    expect(l.p.money.cash).toBe(50_000);
    const c = world.country('KOR');
    l.step();
    expect(l.p.money.deposit).toBeCloseTo(50_000 * (1 + c.depositRate - c.inflation), 0);
  });
  it('집을 사면 계약금을 내고 나머지는 대출이 된다', () => {
    const l = adult();
    const before = l.p.money.cash;
    expect(l.availableActions().some((a) => a.id === 'act.home.buy')).toBe(true);
    l.act('act.home.buy');
    const m = l.p.money;
    expect(m.home).toBeGreaterThan(0);
    expect(m.cash + m.home - m.debt).toBeCloseTo(before, 0);
    expect(l.p.flags.homeowner).toBe(true);
    expect(l.availableActions().some((a) => a.id === 'act.home.buy')).toBe(false);
  });
  it('물건을 사고팔 수 있다', () => {
    const l = adult();
    l.act('item.buy.car');
    expect('car' in l.p.owns).toBe(true);
    expect(l.availableActions().some((a) => a.id === 'item.buy.car')).toBe(false);
    l.act('item.sell.car');
    expect('car' in l.p.owns).toBe(false);
    expect(l.p.log.some((e) => e.key === 'sys.item.sold')).toBe(true);
  });
  it('행동의 재사용 대기', () => {
    const l = adult();
    l.act('act.travel');
    expect(l.availableActions().some((a) => a.id === 'act.travel')).toBe(false);
    l.step();
    expect(l.availableActions().some((a) => a.id === 'act.travel')).toBe(true);
  });
  it('금액은 고를 수 있는 범위로 잘린다', () => {
    const l = adult();
    l.act('act.stocks.buy', 10_000_000);
    expect(l.p.money.stocks).toBe(100_000);
  });
  it('옛 저장본(재산 필드 없음)도 읽힌다', () => {
    const l = Life.born(world, { seed: 'old-save' });
    const old = JSON.parse(JSON.stringify(l.p));
    old.money = { cash: 10, debt: 0, income: 0, pct: 0 };
    delete old.owns;
    delete old.acted;
    const r = new Life(world, old);
    expect(r.p.money.deposit).toBe(0);
    expect(r.p.owns).toEqual({});
    r.liveOut();
    expect(r.p.dead).not.toBeNull();
  });
  it('자동 결정 모드에서는 남는 돈을 굴리고 순자산이 기록된다', () => {
    let invested = 0;
    for (let i = 0; i < 200; i++) {
      const l = Life.born(world, { seed: `auto-money:${i}`, country: 'USA' }).liveOut();
      if (l.p.history.some((h) => h.netWorth > 0) && (l.p.money.stocks > 0 || l.p.money.deposit > 0)) invested++;
    }
    expect(invested).toBeGreaterThan(20);
  });
});

describe('통계 보정 (몬테카를로)', () => {
  // 보정표(data/build/calibration.json)를 쓴 상태에서, 개인 요인과 선택을 넣고도 국가 통계가 유지되어야 한다.
  // 보정·감사와 같은 측정 코드(scripts/measure.ts)를 쓰고, 보정에 쓰지 않은 시드로 검사한다.
  it('보정 파일이 있다', () => {
    expect(world.calibrationFile, 'npm run calibrate 로 data/build/calibration.json을 만드세요').not.toBeNull();
  });

  const N = 2000;
  const pp = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const id of ['KOR', 'USA', 'FRA', 'BRA', 'MEX', 'IND', 'EGY', 'NGA', 'ETH', 'SYR']) {
    it(`${id}: 수명·결혼·출산·노동·건강·사망 원인·이주`, () => {
      const c = world.country(id);
      const m = measureCountry(world, id, N, 'test');
      const target = (world.calibrationFile as unknown as { check: Record<string, { e0Target: Record<'F' | 'M', number> }> }).check[id].e0Target;
      const near = (label: string, got: number, want: number, tol: number, show = pp) =>
        expect(Math.abs(got - want), `${label}: 시뮬 ${show(got)} vs 통계 ${show(want)}`).toBeLessThan(tol);
      const yr = (x: number) => `${x.toFixed(1)}세`;
      for (const sex of ['F', 'M'] as const) {
        near(`기대수명 ${sex}`, e0Of(m, sex), target[sex], 1.0, yr);
        near(`결혼 경험 ${sex}`, rate(m.married47[sex]), c.everMarried[sex], 0.05);
        near(`경제활동참가율 ${sex}`, rate(m.inLabor[sex]), c.lfp[sex], 0.06);
        near(`흡연율 ${sex}`, rate(m.smoking[sex]), c.smoking[sex], 0.04);
      }
      expect(Math.abs(tfrOf(m) / c.tfr - 1), `합계출산율: 시뮬 ${tfrOf(m).toFixed(2)} vs 통계 ${c.tfr}`).toBeLessThan(0.1);
      near('조혼율', rate(m.childMarriage), c.childMarriage, 0.05);
      near('45~49세 이혼·별거', rate(m.divorced47.F), c.divorced.F / 100, 0.04);
      near('실업률', rate(m.unemployed), c.unemployment, 0.02);
      near('당뇨 유병률', rate(m.diabetes), c.diabetesPrev, 0.025);
      for (const g of ['comm', 'ncd', 'inj'] as const) near(`사망 원인 ${g}`, m.causes[g] / m.deaths, c.deathShare[g], 0.04);
      near('해외 거주 비율', rate(m.abroad), c.emigrantShare, Math.max(0.015, c.emigrantShare * 0.15));
      if (c.emigrantShare * c.refugeeShare > 0.02) near('해외 거주자 중 피란민', rate(m.refugeeAbroad), c.refugeeShare, 0.12);
    }, 300_000);
  }
});
