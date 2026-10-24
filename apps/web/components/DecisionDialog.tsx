'use client';
import type { DecisionDef, World } from '@reborn/engine';
import { useEffect, useRef } from 'react';
import { sourceLabel } from '@/lib/format';

export function DecisionDialog({ world, decision, options, age, onChoose }: { world: World; decision: DecisionDef; options: string[]; age: number; onChoose: (id: string) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, [decision.id, age]);
  const opts = decision.options.filter((o) => options.includes(o.id));
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="dec-title" aria-describedby="dec-body" className="card rise w-full max-w-md p-6 shadow-2xl">
        <p className="label">{age}세 · 갈림길</p>
        <h2 id="dec-title" className="mt-1 font-serif text-2xl font-bold">{world.text(decision.title)}</h2>
        <p id="dec-body" className="mt-3 text-muted">{world.text(decision.body)}</p>
        <div className="mt-5 space-y-2">
          {opts.map((o, i) => (
            <button key={o.id} ref={i === 0 ? first : undefined} type="button" onClick={() => onChoose(o.id)}
              className="block w-full cursor-pointer rounded-xl border border-line bg-card px-4 py-3 text-left transition-colors duration-200 hover:border-accent">
              <span className="font-medium">{world.text(o.label)}</span>
              {o.hint && <span className="mt-0.5 block text-sm text-faint">{world.text(o.hint)}</span>}
            </button>
          ))}
        </div>
        {decision.source.length > 0 && <p className="label mt-4">근거 통계: {decision.source.map(sourceLabel).join(', ')}</p>}
      </div>
    </div>
  );
}
