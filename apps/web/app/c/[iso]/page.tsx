import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COUNTRIES, NOW_YEAR, byId, isEst, nameOf, totalBirths, v, type CountryRow } from '@/lib/countries';
import { REGION_LABEL, num, pct } from '@/lib/format';

export const dynamicParams = false;
export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ iso: c.id.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }): Promise<Metadata> {
  const c = byId.get((await params).iso.toUpperCase());
  return c ? { title: `${nameOf(c)} 통계`, description: `${nameOf(c)}에서 태어난다면: 기대수명 여성 ${c.lifeExp.v.F}세·남성 ${c.lifeExp.v.M}세, 5세 전 사망 1,000명당 ${c.u5mr.v}명.` } : {};
}

const SRC: Record<string, string> = { wpp2024: 'UN 세계인구전망 2024', wdi: '세계은행 WDI', wmd2019: 'UN 세계결혼통계 2019', ims2024: 'UN 국제이주자 통계 2024', unhcr2024: 'UNHCR 2024' };
const srcLabel = (s: string) => (s.startsWith('est') ? '추정 (집단 중앙값)' : SRC[s] ?? s);

type Row = [label: string, key: string, fmt: (x: number) => string];
const pctOf100 = (x: number) => `${num(x, 1)}%`;
const SECTIONS: [string, Row[]][] = [
  ['인구와 출생', [['연간 출생아', 'births', (x) => `${num(x)}명`], ['인구', 'population', (x) => `${num(x)}명`], ['합계출산율', 'tfr', (x) => num(x, 2)], ['평균 출산 연령', 'meanAgeBirth', (x) => `${num(x, 1)}세`], ['출생 성비 (여아 100명당 남아)', 'srb', (x) => num(x, 1)]]],
  ['건강과 사망', [['영아 사망 (1,000명당)', 'imr', (x) => num(x, 1)], ['5세 전 사망 (1,000명당)', 'u5mr', (x) => num(x, 1)], ['모성사망비 (출생 10만 명당)', 'mmr', (x) => num(x)], ['30~70세 4대 만성질환 사망 확률', 'ncd3070', pctOf100], ['HIV 유병률 (15~49세)', 'hivPrev', pctOf100], ['당뇨 유병률 (20~79세)', 'diabetesPrev', pctOf100], ['흡연율 여성', 'smokingF', pctOf100], ['흡연율 남성', 'smokingM', pctOf100], ['의료비 본인부담 비율', 'oopHealth', pctOf100]]],
  ['사망 원인 (2019)', [['감염·모성·주산기', 'deathCommShare', pctOf100], ['비감염성 질환', 'deathNcdShare', pctOf100], ['손상 (사고·폭력·자살)', 'deathInjShare', pctOf100], ['교통사고 사망 (10만 명당)', 'roadDeaths', (x) => num(x, 1)], ['살인 (10만 명당)', 'homicide', (x) => num(x, 1)], ['자살 (10만 명당)', 'suicide', (x) => num(x, 1)]]],
  ['교육', [['초등 순취학률', 'primaryEnroll', pctOf100], ['중등 순취학률', 'secondaryEnroll', pctOf100], ['고등교육 총취학률', 'tertiaryEnroll', pctOf100], ['기대 교육연수', 'schoolYears', (x) => `${num(x, 1)}년`], ['성인 문해율', 'literacy', pctOf100]]],
  ['경제와 노동', [['1인당 GDP (구매력 기준, 2021 국제달러)', 'gdpPppPc', (x) => num(x)], ['지니계수', 'gini', (x) => num(x, 1)], ['도시 인구', 'urban', pctOf100], ['농업 고용 비중', 'agriEmployment', pctOf100], ['경제활동참가율 여성 (15~64세)', 'lfpF', pctOf100], ['경제활동참가율 남성 (15~64세)', 'lfpM', pctOf100], ['실업률', 'unemployment', pctOf100]]],
  ['결혼과 가족', [['18세 전 결혼한 여성 (20~24세 중)', 'childMarriage', pctOf100]]],
  ['이주', [['해외에 사는 출생자', 'emigrantShare', (x) => pct(x)], ['해외 거주자 중 피란민', 'refugeeShare', (x) => pct(x)]]],
];

function StatRow({ c, row }: { c: CountryRow; row: Row }) {
  const [label, key, fmt] = row;
  const x = v(c, key);
  const meta = (c as unknown as Record<string, { y: number | null; src: string } | null>)[key];
  if (x === null || !meta) return null;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-2 text-muted">{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fmt(x)}{isEst(c, key) && <span className="ml-1 text-xs text-warm">추정</span>}</td>
      <td className="hidden px-4 py-2 text-xs text-faint sm:table-cell">{srcLabel(meta.src)}{meta.y ? ` · ${meta.y}` : ''}</td>
    </tr>
  );
}

export default async function Page({ params }: { params: Promise<{ iso: string }> }) {
  const c = byId.get((await params).iso.toUpperCase());
  if (!c) notFound();
  const name = nameOf(c);
  const sexed: [string, { v: { F: number; M: number }; y: number | null; src: string }][] = [
    ['기대수명 (세)', c.lifeExp], ['45~49세 결혼 경험 (%)', c.everMarried], ['평균 초혼 연령 (세)', c.marriageAge], ['45~49세 이혼·별거 (%)', c.divorced],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4">
      <p className="label"><Link href="/c/" className="hover:underline">국가 통계</Link> · {REGION_LABEL[c.region]}</p>
      <h1 className="mt-2 font-serif text-4xl font-bold">{name}</h1>
      <p className="mt-3 text-lg text-muted">
        지금 태어나는 아기 중 <b className="text-ink">{pct(c.births.v / totalBirths, 2)}</b>가 {name}에서 태어납니다 ({NOW_YEAR}년 기준 연간 {num(c.births.v)}명).
      </p>
      <section className="card mt-6 overflow-x-auto" aria-label="성별 지표">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-faint"><th className="px-4 py-2 font-normal" /><th className="px-4 py-2 text-right font-normal">여성</th><th className="px-4 py-2 text-right font-normal">남성</th><th className="hidden px-4 py-2 font-normal sm:table-cell">출처</th></tr></thead>
          <tbody>
            {sexed.map(([label, s]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className="px-4 py-2 text-muted">{label}</td><td className="px-4 py-2 text-right tabular-nums">{s.v.F}</td><td className="px-4 py-2 text-right tabular-nums">{s.v.M}</td>
                <td className="hidden px-4 py-2 text-xs text-faint sm:table-cell">{srcLabel(s.src)}{s.y ? ` · ${s.y}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {SECTIONS.map(([title, rows]) => (
        <section key={title} className="mt-8" aria-labelledby={`s-${title}`}>
          <h2 id={`s-${title}`} className="font-serif text-xl font-bold">{title}</h2>
          <div className="card mt-3 overflow-x-auto"><table className="w-full text-sm"><tbody>{rows.map((r) => <StatRow key={r[1]} c={c} row={r} />)}</tbody></table></div>
        </section>
      ))}
      {c.destinations.v.length > 0 && (
        <section className="mt-8" aria-labelledby="s-dest">
          <h2 id="s-dest" className="font-serif text-xl font-bold">{name} 출신 이주자가 사는 곳</h2>
          <ul className="card mt-3 divide-y divide-line text-sm">
            {c.destinations.v.slice(0, 8).map(([id, share]) => {
              const d = byId.get(id as string);
              return d ? (
                <li key={id as string} className="flex justify-between px-4 py-2"><Link href={`/c/${(id as string).toLowerCase()}/`} className="hover:text-accent hover:underline">{nameOf(d)}</Link><span className="tabular-nums text-muted">{pct(share as number)}</span></li>
              ) : null;
            })}
          </ul>
          <p className="label mt-2">UN 국제이주자 통계 2024 · 상위 목적지 사이의 비율</p>
        </section>
      )}
      <div className="mt-10"><Link href="/play/?new=1" className="btn btn-primary h-12 px-6">태어나기</Link></div>
    </div>
  );
}
