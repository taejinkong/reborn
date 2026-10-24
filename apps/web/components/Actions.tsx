'use client';
import type { ActionDef, Life } from '@reborn/engine';
import { useEffect, useRef, useState } from 'react';
import { ppp } from '@/lib/format';

const TABS: [ActionDef['category'], string][] = [
  ['money', '돈·투자'], ['items', '물건'], ['career', '일·공부'], ['love', '사랑·가족'], ['health', '건강'], ['life', '생활'],
];

/** 금액을 고르는 창 */
function AmountDialog({ life, action, onDone, onCancel }: { life: Life; action: ActionDef; onDone: (amount: number) => void; onCancel: () => void }) {
  const [lo, hi] = life.actionRange(action)!;
  const [v, setV] = useState(hi);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const step = Math.max(1, Math.round((hi - lo) / 100));
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" role="presentation" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="amt-title" className="card rise w-full max-w-sm p-6 shadow-2xl">
        <h2 id="amt-title" className="font-serif text-xl font-bold">{life.world.text(action.label)}</h2>
        {action.hint && <p className="mt-1 text-sm text-muted">{life.world.text(action.hint)}</p>}
        <label htmlFor="amt" className="mt-5 block font-serif text-3xl font-bold tabular-nums">{ppp(v)}</label>
        <input id="amt" ref={ref} type="range" className="mt-3 w-full accent-[var(--accent)]" min={Math.floor(lo)} max={Math.floor(hi)} step={step} value={Math.floor(v)} onChange={(e) => setV(Number(e.target.value))} />
        <div className="label flex justify-between"><span>{ppp(lo)}</span><span>{ppp(hi)}</span></div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onCancel}>취소</button>
          <button type="button" className="btn btn-primary" onClick={() => onDone(v)}>확인</button>
        </div>
      </div>
    </div>
  );
}

/** 할 수 있는 일: 언제든 고를 수 있는 행동 */
export function Actions({ life, onAct, onDialog }: { life: Life; onAct: (id: string, amount?: number) => void; onDialog: (open: boolean) => void }) {
  const [tab, setTab] = useState<ActionDef['category']>('money');
  const [asking, setAsking] = useState<ActionDef | null>(null);
  const actions = life.availableActions();
  const count = (c: ActionDef['category']) => actions.filter((a) => a.category === c).length;
  // 아직 살 수 없는 물건도 가격과 함께 흐리게 보여 준다 (돈이 모자라거나 이 나라에서 구하기 어려움)
  const locked = [...life.world.items.values()].filter((it) => !(it.id in life.p.owns) && life.p.age >= it.minAge && !actions.some((a) => a.id === `item.buy.${it.id}`));
  const shown = actions.filter((a) => a.category === tab);
  const items = shown.filter((a) => a.id.startsWith('item.'));
  const others = shown.filter((a) => !a.id.startsWith('item.'));
  const world = life.world;
  const priceOf = (a: ActionDef) => {
    const it = world.items.get(a.id.split('.').pop()!);
    return it ? life.itemPrice(it) : 0;
  };
  const run = (a: ActionDef) => {
    if (a.amount) { setAsking(a); onDialog(true); } else onAct(a.id);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="행동 분류">
        {TABS.map(([c, label]) => (
          <button key={c} type="button" role="tab" aria-selected={tab === c} className="btn min-h-9 px-3 text-sm" aria-pressed={tab === c} onClick={() => setTab(c)} disabled={!count(c) && !(c === 'items' && locked.length)}>
            {label}<span className="text-xs text-faint">{count(c)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="tabpanel">
        {others.map((a) => (
          <button key={a.id} type="button" onClick={() => run(a)} className="cursor-pointer rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors duration-200 hover:border-accent">
            <span className="text-sm font-medium">{world.text(a.label)}</span>
            {a.hint && <span className="mt-0.5 block text-xs text-faint">{world.text(a.hint)}</span>}
          </button>
        ))}
        {items.map((a) => {
          const selling = a.id.startsWith('item.sell.');
          return (
            <button key={a.id} type="button" onClick={() => run(a)} className="flex cursor-pointer items-start justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors duration-200 hover:border-accent">
              <span>
                <span className="text-sm font-medium">{selling ? '팔기 · ' : ''}{world.text(a.label)}</span>
                {a.hint && <span className="mt-0.5 block text-xs text-faint">{world.text(a.hint)}</span>}
              </span>
              {!selling && <span className="shrink-0 text-xs tabular-nums text-muted">{ppp(priceOf(a))}</span>}
            </button>
          );
        })}
        {tab === 'items' && locked.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2 opacity-60" aria-disabled="true">
            <span>
              <span className="text-sm font-medium">{world.text(it.label)}</span>
              <span className="mt-0.5 block text-xs text-faint">돈이 모자라거나 지금 구하기 어렵습니다</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted">{ppp(life.itemPrice(it))}</span>
          </div>
        ))}
        {!shown.length && !(tab === 'items' && locked.length) && <p className="text-sm text-muted sm:col-span-2">지금 이 분류에서 할 수 있는 일이 없습니다.</p>}
      </div>
      <p className="label mt-3">행동은 올해 안에 바로 일어납니다. 확률이 걸린 행동은 실패할 수도 있습니다.</p>
      {asking && (
        <AmountDialog life={life} action={asking} onCancel={() => { setAsking(null); onDialog(false); }}
          onDone={(amount) => { onAct(asking.id, amount); setAsking(null); onDialog(false); }} />
      )}
    </div>
  );
}
