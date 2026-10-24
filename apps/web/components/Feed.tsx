import { render, type LogEntry, type World } from '@reborn/engine';

/** 무거운 장면 숨기기 설정에서 민감한 기록 대신 보여 줄 문장 */
export const SOFT_TEXT = '힘든 일이 있었습니다. (설정에 따라 자세한 내용을 숨겼습니다)';

export function entryText(world: World, e: LogEntry, soft: boolean): string {
  return soft && e.tone === 'sensitive' ? SOFT_TEXT : render(world, e);
}

export function Feed({ world, log, soft, freshFrom }: { world: World; log: LogEntry[]; soft: boolean; freshFrom: number }) {
  const items = log.map((e, i) => ({ e, i })).reverse();
  return (
    <ol className="max-h-[28rem] divide-y divide-line overflow-y-auto pr-1" aria-live="polite" aria-relevant="additions">
      {items.map(({ e, i }) => (
        <li key={i} className={`grid grid-cols-[3.25rem_1fr] gap-3 py-2.5 text-[15px] ${i >= freshFrom ? 'rise' : ''} ${e.tone === 'heavy' || e.tone === 'sensitive' ? 'text-heavy' : ''}`}>
          <span className="tabular-nums text-faint">{e.age}세</span>
          <span>{entryText(world, e, soft)}</span>
        </li>
      ))}
    </ol>
  );
}
