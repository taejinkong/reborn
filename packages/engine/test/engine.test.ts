import { describe, expect, it } from 'vitest';
import { birthOdds } from '../src/birth.ts';
import { lintContent } from '../src/content.ts';
import { Life } from '../src/life.ts';
import { lognormalIncome, oddsNormalizer, scaleOdds } from '../src/math.ts';
import { Rng } from '../src/rng.ts';
import { format, render } from '../src/text.ts';
import { loadWorld } from './world.ts';

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

describe('통계 보정 (몬테카를로)', () => {
  // 개인 요인(형편·건강·흡연·질병)을 넣어도 국가 기대수명이 유지되어야 한다
  const cases: [string, 'F' | 'M'][] = [['KOR', 'F'], ['KOR', 'M'], ['IND', 'F'], ['NGA', 'M'], ['ETH', 'F'], ['USA', 'F'], ['BRA', 'M'], ['JPN', 'F']];
  for (const [id, sex] of cases) {
    it(`${id} ${sex} 기대수명`, () => {
      const N = 3000;
      let sum = 0, n = 0;
      for (let i = 0; i < N * 3 && n < N; i++) {
        const l = Life.born(world, { seed: `${id}${sex}${i}`, country: id });
        if (l.p.sex !== sex) continue;
        l.liveOut();
        sum += l.p.dead!.age + 0.5;
        n++;
      }
      const e0 = sum / n;
      const target = world.country(id).lifeExp[sex];
      expect(Math.abs(e0 - target), `${id} ${sex}: 시뮬 ${e0.toFixed(1)} vs 통계 ${target}`).toBeLessThan(2.0);
    }, 120_000);
  }
});
