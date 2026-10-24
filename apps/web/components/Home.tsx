'use client';
import { birthOdds, countryName, type World } from '@reborn/engine';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { loadCurrent, loadLives, loadSettings, saveSettings, type SavedLife, type Settings } from '@/lib/storage';
import { num, pct } from '@/lib/format';
import { useWorld } from './useWorld';

const SECONDS_PER_YEAR = 365.25 * 86400;

function Counters({ world }: { world: World }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 250);
    return () => clearInterval(id);
  }, []);
  const births = world.countries.reduce((s, c) => s + c.births, 0) / SECONDS_PER_YEAR;
  const deaths = world.countries.reduce((s, c) => s + (Number((c.raw.deaths as { v: number } | undefined)?.v) || 0), 0) / SECONDS_PER_YEAR;
  return (
    <div className="mt-8 grid max-w-md grid-cols-2 gap-4" aria-live="off">
      <div>
        <div className="font-serif text-4xl font-bold tabular-nums">{num(Math.floor(elapsed * births))}</div>
        <div className="label mt-1">이 페이지를 연 뒤 태어난 아기</div>
      </div>
      <div>
        <div className="font-serif text-4xl font-bold tabular-nums text-muted">{num(Math.floor(elapsed * deaths))}</div>
        <div className="label mt-1">같은 시간 세상을 떠난 사람</div>
      </div>
    </div>
  );
}

function Odds({ world, mode }: { world: World; mode: Settings['mode'] }) {
  const key = mode === 'births' ? 'births' : 'population';
  const top = useMemo(() => [...world.countries].sort((a, b) => b[key] - a[key]).slice(0, 10), [world, key]);
  const max = birthOdds(world, top[0], mode);
  const rest = 1 - top.reduce((s, c) => s + birthOdds(world, c, mode), 0);
  return (
    <section className="card p-5" aria-labelledby="odds-title">
      <h2 id="odds-title" className="font-serif text-lg font-bold">{mode === 'births' ? '지금 태어나는 아기라면' : '지금 사는 사람이라면'}</h2>
      <p className="label mt-1">{mode === 'births' ? 'UN 세계인구전망 2024 · 연간 출생아 수 기준' : 'UN 세계인구전망 2024 · 인구 기준'}</p>
      <ul className="mt-4 space-y-2">
        {top.map((c) => {
          const p = birthOdds(world, c, mode);
          return (
            <li key={c.id} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span className="truncate">{countryName(world, c.id)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full bg-accent" style={{ width: `${(p / max) * 100}%` }} /></span>
              <span className="text-right tabular-nums text-muted">{pct(p)}</span>
            </li>
          );
        })}
        <li className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm text-muted">
          <span>나머지 {world.countries.length - 10}곳</span><span /><span className="text-right tabular-nums">{pct(rest)}</span>
        </li>
      </ul>
      <Link href="/c/" className="mt-4 inline-block text-sm text-accent underline-offset-4 hover:underline">{world.countries.length}개 국가·지역 통계 보기</Link>
    </section>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className="btn text-sm" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function Home() {
  const { world, error } = useWorld();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<SavedLife | null>(null);
  const [livesCount, setLivesCount] = useState(0);
  useEffect(() => {
    setSettings(loadSettings());
    setSaved(loadCurrent());
    setLivesCount(loadLives().length);
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings!, ...patch };
    setSettings(next);
    saveSettings(next);
  };
  const sortedCountries = useMemo(
    () => (world ? [...world.countries].map((c) => ({ id: c.id, name: countryName(world, c.id) })).sort((a, b) => a.name.localeCompare(b.name, 'ko')) : []),
    [world],
  );

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid gap-10 pt-6 lg:grid-cols-[1.15fr_1fr] lg:pt-12">
        <div>
          <p className="label">실제 통계로 사는 한 번의 삶</p>
          <h1 className="mt-3 font-serif text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            다시 태어난다면,<br /><span className="text-accent">어디에서</span> 누구로.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            지금 이 순간에도 세상 어딘가에서 아기가 태어납니다. 당신은 그중 한 명이 됩니다.
            태어날 나라도, 집안 형편도 고를 수 없습니다. 선택은 확률을 바꾸지만, 운명을 정하지는 않습니다.
          </p>
          {world && <Counters world={world} />}
        </div>
        <div className="space-y-4">
          {world ? <Odds world={world} mode={settings?.mode ?? 'births'} /> : (
            <div className="card h-80 animate-pulse p-5" aria-busy="true"><span className="sr-only">통계를 불러오는 중</span></div>
          )}
          {error && <p role="alert" className="text-sm text-heavy">통계를 불러오지 못했습니다: {error}</p>}
        </div>
      </section>

      {settings && (
        <section className="card mt-10 grid gap-6 p-5 sm:p-6 md:grid-cols-2" aria-label="태어나기 설정">
          <Segmented label="나라를 뽑는 기준" value={settings.mode} options={[['births', '지금 태어나는 아기'], ['population', '지금 사는 사람']]} onChange={(mode) => update({ mode })} />
          <Segmented label="한 번의 삶 길이 (그 나라 기대수명까지)" value={settings.pace} options={[[30, '약 30분'], [60, '약 1시간'], [90, '약 1시간 30분']]} onChange={(pace) => update({ pace })} />
          <div>
            <label htmlFor="home" className="label mb-2 block">당신이 실제로 태어난 나라 (선택, 비교용)</label>
            <select id="home" className="btn w-full justify-start text-sm" value={settings.home ?? ''} onChange={(e) => update({ home: e.target.value || null })}>
              <option value="">고르지 않음</option>
              {sortedCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="label mt-2">이 기기에만 저장됩니다.</p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="label">진행 방식</span>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={settings.auto} onChange={(e) => update({ auto: e.target.checked })} />
              갈림길을 자동으로 고르고 지켜보기
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={settings.soft} onChange={(e) => update({ soft: e.target.checked })} />
              폭력·자살 같은 무거운 일의 자세한 내용 숨기기
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button type="button" className="btn btn-primary h-14 px-8 text-lg" disabled={!world} onClick={() => router.push('/play/?new=1')}>태어나기</button>
            {saved && world && (
              <button type="button" className="btn h-14" onClick={() => router.push('/play/')}>
                이어하기 · {countryName(world, saved.person.born)} {saved.person.age}세
              </button>
            )}
            {livesCount > 0 && <Link href="/lives/" className="text-sm text-muted underline-offset-4 hover:underline">전생 {livesCount}번</Link>}
          </div>
        </section>
      )}

      <section className="mt-12 grid gap-6 text-sm md:grid-cols-3">
        <div>
          <h3 className="font-serif text-base font-bold">무엇이 실제 데이터인가</h3>
          <p className="mt-2 text-muted">출생아 수와 성별 생명표, 결혼·출산, 학교, 경제활동과 실업, 소득 불평등, 흡연과 당뇨, 사망 원인, 국제 이주와 피란까지 198개 국가·지역의 공개 통계를 씁니다.</p>
        </div>
        <div>
          <h3 className="font-serif text-base font-bold">선택과 확률</h3>
          <p className="mt-2 text-muted">해마다 초점을 고르고, 진학·사랑·이주 같은 갈림길에서 선택합니다. 선택은 가능성을 움직이지만, 태어난 곳의 통계를 완전히 벗어나기는 어렵습니다.</p>
        </div>
        <div>
          <h3 className="font-serif text-base font-bold">통계와 맞춰 본 엔진</h3>
          <p className="mt-2 text-muted">수십만 번의 삶을 미리 살려 보고, 기대수명·결혼·출산·노동·사망 원인이 각 나라 통계와 맞도록 보정했습니다.</p>
        </div>
      </section>
    </div>
  );
}
