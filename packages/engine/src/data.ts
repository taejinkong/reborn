// data/build 의 통계를 엔진용 형태로 변환한다.

export interface StatValue<T = number> {
  v: T;
  y: number | null;
  src: string;
  est?: boolean;
}

/** data/build/countries.json 의 한 국가 레코드 */
export interface CountryRecord {
  id: string;
  iso2: string;
  name: string;
  region: Region;
  income: IncomeGroup;
  births: StatValue;
  population: StatValue;
  tfr: StatValue;
  meanAgeBirth: StatValue;
  srb: StatValue;
  lifeExp: StatValue<{ F: number; M: number }>;
  asfr: StatValue<number[]>;
  everMarried: StatValue<{ F: number; M: number }>;
  marriageAge: StatValue<{ F: number; M: number }>;
  divorced: StatValue<{ F: number; M: number }>;
  emigrantShare: StatValue;
  refugeeShare: StatValue;
  destinations: StatValue<[string, number][]>;
  imr: StatValue;
  u5mr: StatValue;
  [field: string]: unknown;
}

export interface CountriesFile {
  generated: string;
  nowYear: number;
  countries: CountryRecord[];
}

export interface LifetableFile {
  year: number;
  src: string;
  maxAge: number;
  q: Record<string, { F: number[]; M: number[] }>;
}

export type Region = 'eap' | 'eca' | 'lac' | 'mena' | 'na' | 'sa' | 'ssa';
export type IncomeGroup = 'LIC' | 'LMC' | 'UMC' | 'HIC';

/** 엔진이 쓰는 국가 정보. 비율은 0~1로 바꾼다. */
export interface Country {
  id: string;
  iso2: string;
  name: string;
  region: Region;
  income: IncomeGroup;
  births: number;
  population: number;
  tfr: number;
  meanAgeBirth: number;
  /** 출생아 중 남아 비율 */
  maleShare: number;
  lifeExp: { F: number; M: number };
  /** 15-19, 20-24, …, 45-49세 여성의 연간 출산 확률 */
  asfr: number[];
  /** 45~49세까지 결혼한 적 있는 비율 (0~1) */
  everMarried: { F: number; M: number };
  /** 평균 초혼 연령 (SMAM) */
  marriageAge: { F: number; M: number };
  /** 45~49세 중 이혼·별거 상태 비율 (%) */
  divorced: { F: number; M: number };
  imr: number;
  u5mr: number;
  gdpPppPc: number;
  gini: number;
  urban: number;
  agriEmployment: number;
  primaryEnroll: number;
  secondaryEnroll: number;
  tertiaryEnroll: number;
  literacy: number;
  schoolYears: number;
  mmr: number;
  hivPrev: number;
  homicide: number;
  roadDeaths: number;
  smoking: { F: number; M: number };
  oopHealth: number;
  childMarriage: number;
  /** 사망 원인 3대 분류 비중 (WHO GHE 2019, 합≈1) */
  deathShare: { comm: number; ncd: number; inj: number };
  /** 30~70세 사이 4대 비감염성 질환 사망 확률 */
  ncd3070: number;
  /** 자살률 (10만 명당) */
  suicide: number;
  /** 당뇨 유병률 (20~79세) */
  diabetesPrev: number;
  /** 15~64세 경제활동참가율 */
  lfp: { F: number; M: number };
  /** 실업률 */
  unemployment: number;
  /** 이 나라에서 태어나 해외에 사는 사람의 비율 (UN IMS 2024) */
  emigrantShare: number;
  /** 해외 거주자 중 피란민 비율 (UNHCR 2024) */
  refugeeShare: number;
  /** 이 나라 출신 이주자가 사는 곳과 비율 [국가, 비율][] */
  destinations: [string, number][];
  /** 추정값으로 채운 필드 이름 */
  estimated: string[];
  /** 원본 레코드 (출처 표시용) */
  raw: CountryRecord;
}

const num = (r: CountryRecord, f: string) => (r[f] as StatValue | null)?.v ?? NaN;
const pct = (r: CountryRecord, f: string, cap = 1) => Math.min(cap, num(r, f) / 100);

export function toCountry(r: CountryRecord): Country {
  const estimated = Object.keys(r).filter((k) => (r[k] as StatValue | null)?.est);
  return {
    id: r.id,
    iso2: r.iso2,
    name: r.name,
    region: r.region,
    income: r.income,
    births: r.births.v,
    population: r.population.v,
    tfr: r.tfr.v,
    meanAgeBirth: r.meanAgeBirth.v,
    maleShare: r.srb.v / (100 + r.srb.v),
    lifeExp: r.lifeExp.v,
    asfr: r.asfr.v.map((x) => x / 1000),
    everMarried: { F: r.everMarried.v.F / 100, M: r.everMarried.v.M / 100 },
    marriageAge: r.marriageAge.v,
    divorced: r.divorced.v,
    imr: r.imr.v,
    u5mr: r.u5mr.v,
    gdpPppPc: num(r, 'gdpPppPc'),
    gini: num(r, 'gini') / 100,
    urban: pct(r, 'urban'),
    agriEmployment: pct(r, 'agriEmployment'),
    primaryEnroll: pct(r, 'primaryEnroll', 0.995),
    secondaryEnroll: pct(r, 'secondaryEnroll', 0.99),
    // 총취학률은 100%를 넘을 수 있어 진학 확률로 쓸 때 상한을 둔다
    tertiaryEnroll: pct(r, 'tertiaryEnroll', 0.9),
    literacy: pct(r, 'literacy'),
    schoolYears: num(r, 'schoolYears'),
    mmr: num(r, 'mmr'),
    hivPrev: pct(r, 'hivPrev'),
    homicide: num(r, 'homicide'),
    roadDeaths: num(r, 'roadDeaths'),
    smoking: { F: pct(r, 'smokingF'), M: pct(r, 'smokingM') },
    oopHealth: pct(r, 'oopHealth'),
    childMarriage: pct(r, 'childMarriage'),
    deathShare: (() => {
      const comm = num(r, 'deathCommShare'), ncd = num(r, 'deathNcdShare'), inj = num(r, 'deathInjShare');
      const t = comm + ncd + inj;
      return { comm: comm / t, ncd: ncd / t, inj: inj / t };
    })(),
    ncd3070: pct(r, 'ncd3070'),
    suicide: num(r, 'suicide'),
    diabetesPrev: pct(r, 'diabetesPrev'),
    lfp: { F: pct(r, 'lfpF'), M: pct(r, 'lfpM') },
    unemployment: pct(r, 'unemployment'),
    emigrantShare: r.emigrantShare.v,
    refugeeShare: r.refugeeShare.v,
    destinations: r.destinations.v,
    estimated,
    raw: r,
  };
}
