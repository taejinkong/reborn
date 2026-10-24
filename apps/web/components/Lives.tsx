'use client';
import { countryName } from '@reborn/engine';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SEX_LABEL, num } from '@/lib/format';
import { clearLives, loadLives, type LifeSummary } from '@/lib/storage';
import { useWorld } from './useWorld';

export function Lives() {
  const { world } = useWorld();
  const [lives, setLives] = useState<LifeSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setLives(loadLives()), []);
  if (!lives || !world) return <div className="grid min-h-[40vh] place-items-center text-muted" aria-busy="true">불러오는 중…</div>;

  const countries = new Set(lives.flatMap((l) => l.livedIn));
  const avg = lives.length ? lives.reduce((s, l) => s + l.deathAge, 0) / lives.length : 0;
  return (
    <div className="mx-auto max-w-4xl px-4">
      <h1 className="font-serif text-4xl font-bold">전생 기록</h1>
      <p className="mt-2 text-muted">이 브라우저에만 남는 기록입니다.</p>
      {lives.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="text-muted">아직 끝까지 산 삶이 없습니다.</p>
          <Link href="/play/?new=1" className="btn btn-primary mt-4">태어나기</Link>
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            {[['산 삶', `${lives.length}번`], ['살아 본 나라', `${countries.size}곳`], ['평균 수명', `${num(avg, 1)}세`]].map(([k, v]) => (
              <div key={k} className="card p-4"><dt className="label">{k}</dt><dd className="mt-1 font-serif text-2xl font-bold">{v}</dd></div>
            ))}
          </dl>
          <ul className="mt-6 space-y-3">
            {lives.map((l) => (
              <li key={l.seed} className="card">
                <button type="button" className="flex w-full cursor-pointer items-start justify-between gap-4 p-4 text-left" aria-expanded={open === l.seed} onClick={() => setOpen(open === l.seed ? null : l.seed)}>
                  <span>
                    <span className="font-medium">{l.livedIn.map((id) => countryName(world, id)).join(' → ')} · {SEX_LABEL[l.sex]} · {l.deathAge}세</span>
                    <span className="mt-1 block text-sm text-muted">{l.epitaph}</span>
                  </span>
                  <span className="label shrink-0">{l.birthYear}–{l.deathYear}</span>
                </button>
                {open === l.seed && (
                  <ol className="divide-y divide-line border-t border-line px-4 pb-3">
                    {l.highlights.map((h, i) => (
                      <li key={i} className="grid grid-cols-[3.25rem_1fr] gap-3 py-2 text-sm"><span className="tabular-nums text-faint">{h.age}세</span><span>{h.text}</span></li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            {confirming ? (
              <span className="flex flex-wrap items-center gap-3 text-sm">
                지운 기록은 되돌릴 수 없습니다.
                <button type="button" className="btn text-heavy" onClick={() => { clearLives(); setLives([]); setConfirming(false); }}>모두 지우기</button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>취소</button>
              </span>
            ) : (
              <button type="button" className="btn text-sm" onClick={() => setConfirming(true)}>기록 지우기</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
