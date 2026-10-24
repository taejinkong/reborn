// 인생 지도: 한 칸이 1년. 칸 색은 그해의 행복, 점은 그해의 큰 일.
import type { LogEntry, YearRecord } from '@reborn/engine';

const MARK: Record<string, string> = { loss: 'var(--heavy)', death: 'var(--heavy)', migration: 'var(--warm)', love: 'var(--st-relations)', family: 'var(--st-relations)', achievement: 'var(--accent)', new_start: 'var(--accent)' };

function markOf(entries: LogEntry[]): string | null {
  for (const tag of ['death', 'loss', 'migration', 'love', 'family', 'achievement', 'new_start']) {
    if (entries.some((e) => e.tags?.includes(tag))) return MARK[tag];
  }
  return null;
}

export function LifeGrid({ history, log, age, dead }: { history: YearRecord[]; log: LogEntry[]; age: number; dead: boolean }) {
  const cells = Math.max(100, Math.ceil((age + 1) / 10) * 10);
  const byAge = new Map<number, LogEntry[]>();
  for (const e of log) byAge.set(e.age, [...(byAge.get(e.age) ?? []), e]);
  return (
    <div>
      <div className="grid grid-cols-10 gap-1" role="img" aria-label={`인생 지도: ${history.length}년을 살았습니다`}>
        {Array.from({ length: cells }, (_, a) => {
          const h = history[a];
          const lived = !!h;
          const current = !dead && a === age;
          const mark = markOf(byAge.get(a) ?? []);
          const shade = lived ? 0.25 + (h.stats.happiness / 100) * 0.75 : 0;
          return (
            <div key={a} title={lived ? `${a}세 · 행복 ${Math.round(h.stats.happiness)}` : `${a}세`}
              className={`relative aspect-square rounded-[3px] ${current ? 'ring-2 ring-accent' : ''}`}
              style={{ background: lived ? `color-mix(in srgb, var(--st-happiness) ${shade * 100}%, var(--sunk))` : 'var(--sunk)', opacity: lived || current ? 1 : 0.55 }}>
              {mark && <span className="absolute inset-0 m-auto size-1.5 rounded-full" style={{ background: mark }} />}
            </div>
          );
        })}
      </div>
      <p className="label mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <span>칸 색이 진할수록 행복했던 해</span>
        <span><i className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: 'var(--accent)' }} />성취·새 출발</span>
        <span><i className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: 'var(--st-relations)' }} />사랑·가족</span>
        <span><i className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: 'var(--warm)' }} />이주</span>
        <span><i className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: 'var(--heavy)' }} />상실</span>
      </p>
    </div>
  );
}
