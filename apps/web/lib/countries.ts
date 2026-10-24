// 국가 통계 페이지용 (빌드 시 서버에서만 쓴다)
import countriesFile from '../../../data/build/countries.json';
import { koName } from './format';

export type CountryRow = (typeof countriesFile.countries)[number];
export const COUNTRIES: CountryRow[] = countriesFile.countries;
export const NOW_YEAR = countriesFile.nowYear;
export const nameOf = (c: { iso2: string; name: string }) => koName(c.iso2, c.name);
export const byId = new Map(COUNTRIES.map((c) => [c.id, c]));
export const totalBirths = COUNTRIES.reduce((s, c) => s + c.births.v, 0);
export const v = (c: CountryRow, key: string): number | null => {
  const x = (c as unknown as Record<string, { v: unknown } | null>)[key];
  return x && typeof x.v === 'number' ? x.v : null;
};
export const isEst = (c: CountryRow, key: string) => !!(c as unknown as Record<string, { est?: boolean } | null>)[key]?.est;
