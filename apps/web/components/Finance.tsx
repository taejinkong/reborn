import type { Life } from '@reborn/engine';
import { num, pct, ppp } from '@/lib/format';

/** 살림과 재산: 순자산과 내역, 저축률, 가진 물건 */
export function Finance({ life }: { life: Life }) {
  const p = life.p, m = p.money, world = life.world;
  const rows: [string, number, string?][] = [
    ['현금', m.cash],
    ['예금', m.deposit],
    ['주식', m.stocks],
    ['내 집', m.home],
    ['세놓은 부동산', m.property],
    ['빚', -m.debt, 'text-heavy'],
  ];
  const owns = Object.keys(p.owns).map((id) => world.items.get(id)).filter(Boolean);
  const market = typeof p.flags.market === 'number' ? (p.flags.market as number) : null;
  const net = life.netWorth();
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted">순자산</span>
        <span className={`font-serif text-xl font-bold tabular-nums ${net < 0 ? 'text-heavy' : ''}`}>{ppp(net)}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        {rows.filter(([, v]) => Math.abs(v) >= 1).map(([k, v, cls]) => (
          <div key={k} className="contents"><dt className="text-faint">{k}</dt><dd className={`text-right tabular-nums ${cls ?? ''}`}>{ppp(v)}</dd></div>
        ))}
      </dl>
      <p className="label mt-2">
        {m.income > 0 ? <>저축률 {pct(m.saveRate ?? life.defaultSaveRate(), 0)}{m.saveRate === null ? ' (자동)' : ''} · </> : null}
        {market !== null && m.stocks > 0 ? <>작년 주식 {market >= 0 ? '+' : ''}{num((Math.exp(market) - 1) * 100, 1)}% · </> : null}
        구매력(PPP) 달러
      </p>
      {owns.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="가진 물건">
          {owns.map((it) => <span key={it!.id} className="rounded-full bg-sunk px-2.5 py-1 text-xs">{world.text(it!.label)}</span>)}
        </div>
      )}
    </div>
  );
}
