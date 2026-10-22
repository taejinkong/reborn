import { describe, expect, it } from 'vitest';
import { compile, parse, type Scope } from '../src/expr.ts';

const scope: Scope = {
  vars: { age: 30, stats: { health: 70 }, flags: { a: true }, country: { region: 'sa' } },
  fns: { max: (...x) => Math.max(...(x as number[])) },
};
const ev = (s: string) => compile(s)(scope);

describe('표현식', () => {
  it('산술과 우선순위', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('-2 * 3')).toBe(-6);
    expect(ev('10 - 4 - 3')).toBe(3);
  });
  it('경로·비교·논리', () => {
    expect(ev('age >= 18 && stats.health > 50')).toBe(true);
    expect(ev('!flags.a || flags.missing')).toBe(undefined);
    expect(ev("country.region in ['sa', 'ssa']")).toBe(true);
  });
  it('삼항과 함수', () => {
    expect(ev('age < 25 ? 1 : 2')).toBe(2);
    expect(ev('max(age, 40) / 2')).toBe(20);
  });
  it('잘못된 식은 파싱 오류', () => {
    expect(() => parse('age >')).toThrow();
    expect(() => parse('age; alert(1)')).toThrow();
    expect(() => compile('unknownFn(1)')(scope)).toThrow();
  });
});
