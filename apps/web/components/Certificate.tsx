import { birthOdds, countryName, type Person, type World } from '@reborn/engine';
import { HOUSEHOLD_LABEL, SEX_LABEL, num, pct, ppp } from '@/lib/format';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (<><dt className="text-faint">{k}</dt><dd>{v}</dd></>);
}

export function Certificate({ world, p, home, onBegin }: { world: World; p: Person; home: string | null; onBegin: () => void }) {
  const c = world.country(p.born);
  const h = home && home !== p.born ? world.country(home) : null;
  const odds = birthOdds(world, c, p.mode);
  const cmp: [string, string, string][] = h ? [
    ['기대수명', `${c.lifeExp[p.sex]}세`, `${h.lifeExp[p.sex]}세`],
    ['5세 전 사망 (1,000명당)', num(c.u5mr, 1), num(h.u5mr, 1)],
    ['1인당 GDP (구매력 기준)', ppp(c.gdpPppPc), ppp(h.gdpPppPc)],
    ['고등교육 취학률', pct(c.tertiaryEnroll, 0), pct(h.tertiaryEnroll, 0)],
  ] : [];
  return (
    <article className="card rise mx-auto max-w-2xl overflow-hidden" aria-labelledby="cert-title">
      <div className="flex items-center justify-between bg-accent px-6 py-3 text-accent-ink">
        <span className="font-serif font-bold">출생 신고</span>
        <span className="font-mono text-xs opacity-80">No. {p.seed.slice(0, 8).toUpperCase()}</span>
      </div>
      <div className="p-6 sm:p-8">
        <p className="label">{p.birthYear}년, 당신은</p>
        <h1 id="cert-title" className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{countryName(world, c.id)}의 {p.urban ? '한 도시' : '한 시골 마을'}에서 태어났습니다</h1>
        <dl className="mt-6 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-[15px]">
          <Row k="성별" v={SEX_LABEL[p.sex]} />
          <Row k="집안 형편" v={HOUSEHOLD_LABEL[p.household]} />
          <Row k="어머니 · 아버지" v={`${p.family.mother.age}세 · ${p.family.father.age}세`} />
          <Row k="형제자매" v={p.family.siblings ? `${p.family.siblings}명` : '없음'} />
          <Row k="기대수명" v={`${c.lifeExp[p.sex]}세 (${SEX_LABEL[p.sex]})`} />
        </dl>
        <p className="mt-6 rounded-xl bg-sunk px-4 py-3 text-sm text-muted">
          지금 태어나는 아기 중 <b className="text-ink">{pct(odds)}</b>가 {countryName(world, c.id)}에서 태어납니다.
          그중에서도 이 집, 이 날, 당신입니다.
        </p>
        {h && (
          <div className="mt-6">
            <h2 className="label mb-2">당신이 실제로 태어난 {countryName(world, h.id)}와 비교</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-faint"><th className="py-1 font-normal" /><th className="py-1 font-normal">{countryName(world, c.id)}</th><th className="py-1 font-normal">{countryName(world, h.id)}</th></tr></thead>
              <tbody>{cmp.map(([k, a, b]) => <tr key={k} className="border-t border-line"><td className="py-1.5 text-muted">{k}</td><td className="py-1.5 tabular-nums">{a}</td><td className="py-1.5 tabular-nums">{b}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="mt-8 flex justify-end">
          <button type="button" className="btn btn-primary h-12 px-6" onClick={onBegin} autoFocus>삶을 시작하기</button>
        </div>
      </div>
    </article>
  );
}
