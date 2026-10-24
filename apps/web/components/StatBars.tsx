import type { Stats } from '@reborn/engine';
import { STAT_LABEL } from '@/lib/format';

const KEYS = ['health', 'happiness', 'knowledge', 'relations'] as const;

export function StatBars({ stats }: { stats: Stats }) {
  return (
    <dl className="space-y-2">
      {KEYS.map((k) => (
        <div key={k} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-3 text-sm">
          <dt className="text-muted">{STAT_LABEL[k]}</dt>
          <dd className="h-2.5 overflow-hidden rounded-full bg-sunk" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats[k])} aria-label={STAT_LABEL[k]}>
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${stats[k]}%`, background: `var(--st-${k})` }} />
          </dd>
          <dd className="text-right tabular-nums text-muted">{Math.round(stats[k])}</dd>
        </div>
      ))}
    </dl>
  );
}
