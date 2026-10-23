// 통계·생명표·콘텐츠를 묶은 "세계". 삶은 세계 위에서 만들어진다.
import { defaultCalibration, type CalibrationFile, type CountryCalibration } from './calibration.ts';
import { ContentBundle, type Content, type EventDef, type FocusDef, type JobDef } from './content.ts';
import { toCountry, type CountriesFile, type Country, type LifetableFile } from './data.ts';
import type { Sex } from './state.ts';

export interface WorldInput {
  countries: CountriesFile;
  lifetable: LifetableFile;
  content: unknown;
  /** 없으면 보정 없이(배수 1) 동작한다 */
  calibration?: CalibrationFile;
}

export class World {
  readonly countries: Country[];
  readonly byId: Map<string, Country>;
  readonly nowYear: number;
  readonly content: Content;
  readonly events: Map<string, EventDef>;
  readonly focus: Map<string, FocusDef>;
  readonly jobs: Map<string, JobDef>;
  private readonly q: LifetableFile['q'];
  private readonly maxAge: number;
  private readonly calib: Record<string, CountryCalibration>;
  readonly calibrationFile: CalibrationFile | null;

  constructor(input: WorldInput) {
    this.countries = input.countries.countries.filter((c) => input.lifetable.q[c.id]).map(toCountry);
    this.byId = new Map(this.countries.map((c) => [c.id, c]));
    this.nowYear = input.countries.nowYear;
    this.q = input.lifetable.q;
    this.maxAge = input.lifetable.maxAge;
    this.content = ContentBundle.parse(input.content);
    this.events = new Map(this.content.events.map((e) => [e.id, e]));
    this.focus = new Map(this.content.focus.map((f) => [f.id, f]));
    this.jobs = new Map(this.content.jobs.map((j) => [j.id, j]));
    this.calibrationFile = input.calibration ?? null;
    // 예전 보정 파일에 없는 계수는 기본값으로 채운다
    this.calib = Object.fromEntries(Object.entries(input.calibration?.countries ?? {}).map(([id, c]) => [id, { ...defaultCalibration(), ...c }]));
  }

  /** 국가 보정 계수. 보정 스크립트는 setCalibration으로 바꿔 가며 반복한다. */
  calibration(id: string): CountryCalibration {
    return (this.calib[id] ??= defaultCalibration());
  }

  setCalibration(id: string, c: CountryCalibration): void {
    this.calib[id] = c;
  }

  country(id: string): Country {
    const c = this.byId.get(id);
    if (!c) throw new Error(`알 수 없는 국가 ${id}`);
    return c;
  }

  /** 나이 x에서 x+1 사이에 사망할 확률 */
  qx(countryId: string, sex: Sex, age: number): number {
    const t = this.q[countryId] ?? this.q.USA;
    return t[sex][Math.min(Math.max(0, Math.floor(age)), this.maxAge)];
  }

  text(key: string, lang = 'ko'): string {
    return this.content.i18n[lang]?.[key] ?? key;
  }
}
