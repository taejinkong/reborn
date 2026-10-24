import type { Metadata } from 'next';
import Link from 'next/link';
import { COUNTRIES, nameOf, totalBirths } from '@/lib/countries';
import { REGION_LABEL, num, pct } from '@/lib/format';

export const metadata: Metadata = { title: '198개 국가·지역 통계', description: '출생아 수, 기대수명, 영유아 사망, 소득, 교육, 결혼, 노동, 이주 — Reborn이 쓰는 공개 통계와 출처.' };

export default function Page() {
  const regions = Object.keys(REGION_LABEL);
  return (
    <div className="mx-auto max-w-6xl px-4">
      <h1 className="font-serif text-4xl font-bold">{COUNTRIES.length}개 국가·지역 통계</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Reborn은 아래 공개 통계로 한 사람의 일생을 계산합니다. 나라를 누르면 지표별 값과 기준 연도, 출처를 볼 수 있습니다.
        빈 값은 같은 지역·소득그룹의 중앙값으로 채우고 &lsquo;추정&rsquo;으로 표시했습니다.
      </p>
      {regions.map((r) => {
        const list = COUNTRIES.filter((c) => c.region === r).sort((a, b) => b.births.v - a.births.v);
        if (!list.length) return null;
        return (
          <section key={r} className="mt-10" aria-labelledby={`r-${r}`}>
            <h2 id={`r-${r}`} className="font-serif text-xl font-bold">{REGION_LABEL[r]}</h2>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead><tr className="border-b border-line text-left text-faint">
                  <th className="px-4 py-2 font-normal">나라</th><th className="px-4 py-2 text-right font-normal">태어날 확률</th>
                  <th className="px-4 py-2 text-right font-normal">기대수명 여/남</th><th className="px-4 py-2 text-right font-normal">5세 전 사망</th><th className="px-4 py-2 text-right font-normal">1인당 GDP</th>
                </tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2"><Link href={`/c/${c.id.toLowerCase()}/`} className="hover:text-accent hover:underline">{nameOf(c)}</Link></td>
                      <td className="px-4 py-2 text-right tabular-nums">{pct(c.births.v / totalBirths, 2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.lifeExp.v.F} / {c.lifeExp.v.M}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{num(c.u5mr.v, 1)}‰</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.gdpPppPc ? num(c.gdpPppPc.v) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
