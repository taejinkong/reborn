'use client';
import { Life, countryName, type DecisionDef, type World } from '@reborn/engine';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EDU_LABEL, HOUSEHOLD_LABEL, SCHOOL_LABEL, SEX_LABEL, num, pct, ppp } from '@/lib/format';
import { addLife, loadCurrent, loadSettings, saveCurrent, saveSettings, type LifeSummary, type Settings } from '@/lib/storage';
import { summarize } from '@/lib/summary';
import { Actions } from './Actions';
import { Certificate } from './Certificate';
import { DeathRecord } from './DeathRecord';
import { DecisionDialog } from './DecisionDialog';
import { Feed, entryText } from './Feed';
import { Finance } from './Finance';
import { Icon } from './Icon';
import { LifeGrid } from './LifeGrid';
import { Scene } from './Scene';
import { StatBars } from './StatBars';
import { SurvivalChart } from './SurvivalChart';
import { useWorld } from './useWorld';

type Phase = 'loading' | 'roll' | 'cert' | 'life' | 'dead';
const SPEEDS = [1, 2, 4, 8, 16];
/** '다음 갈림길까지' 배속 */
const FAST_FORWARD = 48;

// ── 출생 추첨 연출 ─────────────────────────────────────────
function Roll({ world, target, onDone }: { world: World; target: string; onDone: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onDone(); return; }
    const total = world.countries.reduce((s, c) => s + c.births, 0);
    const pick = () => {
      let r = Math.random() * total;
      for (const c of world.countries) if ((r -= c.births) < 0) return c.id;
      return target;
    };
    let delay = 60, elapsed = 0, timer = 0;
    const tick = () => {
      elapsed += delay;
      if (elapsed > 2400) { setName(countryName(world, target)); timer = window.setTimeout(onDone, 900); return; }
      setName(countryName(world, pick()));
      delay *= 1.07;
      timer = window.setTimeout(tick, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [world, target, onDone]);
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="label">태어날 곳을 정하는 중</p>
        <p className="mt-4 font-serif text-5xl font-bold sm:text-6xl" aria-live="polite">{name}</p>
      </div>
    </div>
  );
}

// ── 인생 화면 ─────────────────────────────────────────────
function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      <h2 className="font-serif text-base font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function familyText(life: Life): string {
  const f = life.p.family;
  const kids = f.children.filter((k) => k.alive).length;
  return [
    f.mother.alive ? '어머니' : null,
    f.father.alive ? '아버지' : null,
    f.siblings ? `형제자매 ${f.siblings}` : null,
    f.partner ? (f.partner.married ? '배우자' : '연인') : null,
    kids ? `자녀 ${kids}` : null,
  ].filter(Boolean).join(' · ') || '혼자';
}

export function Game() {
  const { world, error } = useWorld();
  const router = useRouter();
  const params = useSearchParams();
  const lifeRef = useRef<Life | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pace, setPace] = useState<Settings['pace']>(60);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [decision, setDecision] = useState<DecisionDef | null>(null);
  const [dialog, setDialog] = useState(false);
  const [summary, setSummary] = useState<LifeSummary | null>(null);
  const [freshFrom, setFreshFrom] = useState(0);
  const [, setVersion] = useState(0);
  const progressRef = useRef<HTMLSpanElement>(null);
  const bump = () => setVersion((v) => v + 1);

  // 새 삶 또는 이어하기
  useEffect(() => {
    if (!world) return;
    const s = loadSettings();
    setSettings(s);
    const saved = loadCurrent();
    if (params.get('new') === '1' || !saved || saved.person.dead) {
      const life = Life.born(world, { mode: s.mode, year: new Date().getFullYear() });
      lifeRef.current = life;
      setPace(s.pace);
      saveCurrent({ person: life.p, pace: s.pace, savedAt: Date.now() });
      setFreshFrom(life.p.log.length);
      setPhase('roll');
      router.replace('/play/');
    } else {
      const life = new Life(world, saved.person);
      lifeRef.current = life;
      setPace(saved.pace);
      setFreshFrom(life.p.log.length);
      setPhase('life');
      if (life.p.pending) setDecision(world.events.get(life.p.pending.event) as DecisionDef);
    }
    // 처음 한 번만 정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  const persist = useCallback(() => {
    const life = lifeRef.current;
    if (life && !life.p.dead) saveCurrent({ person: life.p, pace, savedAt: Date.now() });
  }, [pace]);

  const finish = useCallback(() => {
    const life = lifeRef.current!;
    const s = summarize(life.world, life.p, settings?.soft ?? false);
    addLife(s);
    saveCurrent(null);
    setSummary(s);
    window.setTimeout(() => { setPhase('dead'); window.scrollTo({ top: 0 }); }, 1400);
  }, [settings]);

  const yearPasses = useCallback(() => {
    const life = lifeRef.current!;
    setFreshFrom(life.p.log.length);
    const r = life.step();
    if (r.died) {
      bump();
      finish();
      return;
    }
    if (r.decision) {
      if (settings?.auto) life.autoChoose();
      else { setDecision(r.decision); setFast(false); }
    }
    persist();
    bump();
  }, [settings, persist, finish]);

  // 시간 흐름: 1년 = yearSeconds(pace) / 배속
  useEffect(() => {
    if (phase !== 'life' || paused || decision || dialog || !lifeRef.current || lifeRef.current.p.dead) return;
    const life = lifeRef.current;
    const yearSec = life.yearSeconds(pace);
    let acc = 0, last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const speed = fast ? FAST_FORWARD : SPEEDS[speedIdx];
      acc += ((now - last) / 1000) * speed;
      last = now;
      if (progressRef.current) progressRef.current.style.width = `${Math.min(100, (acc / yearSec) * 100)}%`;
      if (acc >= yearSec) {
        acc = 0;
        yearPasses();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  // 스페이스바: 멈춤/계속
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || phase !== 'life' || decision) return;
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
      e.preventDefault();
      setPaused((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, decision]);

  const choose = (id: string) => {
    const life = lifeRef.current!;
    setFreshFrom(life.p.log.length);
    life.choose(id);
    setDecision(null);
    persist();
    bump();
  };

  const act = (id: string, amount?: number) => {
    const life = lifeRef.current!;
    setFreshFrom(life.p.log.length);
    life.act(id, amount);
    persist();
    bump();
  };

  const toggleAuto = () => {
    const next = { ...settings!, auto: !settings!.auto };
    setSettings(next);
    saveSettings(next);
    const life = lifeRef.current!;
    if (next.auto && life.p.pending) {
      life.autoChoose();
      setDecision(null);
      persist();
      bump();
    }
  };

  const again = () => router.replace('/play/?new=1');
  useEffect(() => {
    // '다시 태어나기'로 같은 페이지에 다시 들어온 경우
    if (world && params.get('new') === '1' && phase === 'dead') {
      const s = loadSettings();
      const life = Life.born(world, { mode: s.mode, year: new Date().getFullYear() });
      lifeRef.current = life;
      setSettings(s);
      setPace(s.pace);
      setSummary(null);
      setSpeedIdx(0);
      setFast(false);
      setPaused(false);
      saveCurrent({ person: life.p, pace: s.pace, savedAt: Date.now() });
      setFreshFrom(life.p.log.length);
      setPhase('roll');
      router.replace('/play/');
    }
  }, [params, world, phase, router]);

  if (error) return <p role="alert" className="mx-auto max-w-xl px-4 py-20 text-heavy">통계를 불러오지 못했습니다: {error}</p>;
  if (!world || !lifeRef.current || phase === 'loading' || !settings) {
    return <div className="grid min-h-[50vh] place-items-center text-muted" aria-busy="true">불러오는 중…</div>;
  }
  const life = lifeRef.current;
  const p = life.p;

  if (phase === 'roll') return <Roll world={world} target={p.born} onDone={() => setPhase('cert')} />;
  if (phase === 'cert') return <div className="px-4 py-6"><Certificate world={world} p={p} home={settings.home} onBegin={() => setPhase('life')} /></div>;
  if (phase === 'dead' && summary) return <DeathRecord world={world} p={p} summary={summary} onAgain={again} />;

  const here = world.country(p.country);
  const latest = [...p.log].reverse().find((e) => !e.key.startsWith('sys.birth')) ?? p.log[p.log.length - 1];
  const job = p.job ? world.text(world.jobs.get(p.job)!.label) : p.retired ? '은퇴' : p.flags.outOfLabor ? '집안일' : '없음';

  return (
    <div>
      <div className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="mr-auto flex items-baseline gap-2">
            <span className="font-serif text-3xl font-bold tabular-nums">{p.age}</span>
            <span className="text-sm text-muted">세 · {p.year}년</span>
          </div>
          <div className="order-last h-1 w-full overflow-hidden rounded-full bg-sunk sm:order-none sm:w-28" aria-hidden="true">
            <span ref={progressRef} className="block h-full bg-accent" style={{ width: 0 }} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="시간 흐름">
            <button type="button" className="btn px-3" aria-pressed={paused} onClick={() => setPaused((v) => !v)} aria-label={paused ? '계속' : '멈춤'}>
              <Icon name={paused ? 'play' : 'pause'} />
            </button>
            {SPEEDS.map((s, i) => (
              <button key={s} type="button" className="btn hidden px-2.5 text-sm tabular-nums sm:inline-flex" aria-pressed={!fast && speedIdx === i} onClick={() => { setSpeedIdx(i); setFast(false); setPaused(false); }}>{s}×</button>
            ))}
            <select className="btn px-2 text-sm sm:hidden" aria-label="배속" value={speedIdx} onChange={(e) => { setSpeedIdx(Number(e.target.value)); setFast(false); }}>
              {SPEEDS.map((s, i) => <option key={s} value={i}>{s}×</option>)}
            </select>
            <button type="button" className="btn px-3 text-sm" aria-pressed={fast} onClick={() => { setFast((v) => !v); setPaused(false); }} title="다음 갈림길이 올 때까지 빠르게">
              <Icon name="forward" /><span className="hidden md:inline">다음 갈림길까지</span>
            </button>
            <button type="button" className="btn px-3 text-sm" aria-pressed={settings.auto} onClick={toggleAuto} title="갈림길을 자동으로 고릅니다">
              <Icon name="auto" /><span className="hidden md:inline">자동 결정</span>
            </button>
            <Link href="/" className="btn px-3" aria-label="처음으로 (진행은 저장됩니다)"><Icon name="home" /></Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[17rem_1fr_19rem]">
        <div className="space-y-4">
          <Panel title="당신">
            <StatBars stats={p.stats} />
            <dl className="mt-4 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-faint">태어난 곳</dt><dd>{countryName(world, p.born)}</dd>
              {p.country !== p.born && (<><dt className="text-faint">사는 곳</dt><dd>{countryName(world, p.country)}{p.flags.refugee ? ' (피란)' : ''}</dd></>)}
              <dt className="text-faint">성별</dt><dd>{SEX_LABEL[p.sex]}</dd>
              <dt className="text-faint">집안 형편</dt><dd>{HOUSEHOLD_LABEL[p.household]}</dd>
              <dt className="text-faint">학력</dt><dd>{p.edu.school ? SCHOOL_LABEL[p.edu.school.stage] : EDU_LABEL[p.edu.level]}</dd>
              <dt className="text-faint">일</dt><dd>{job}</dd>
              <dt className="text-faint">연 소득</dt><dd>{p.money.income > 0 ? <>{ppp(p.money.income)} <span className="text-faint">PPP</span></> : '—'}</dd>
              <dt className="text-faint">가족</dt><dd>{familyText(life)}</dd>
            </dl>
          </Panel>
          <Panel title="살림과 재산"><Finance life={life} /></Panel>
        </div>

        <div className="space-y-4">
          <section className="card overflow-hidden" aria-label="지금 삶의 모습">
            <div className="aspect-[2/1] bg-sunk"><Scene p={p} /></div>
            <p className="px-5 py-4 font-serif text-lg leading-snug" aria-live="polite">{entryText(world, latest, settings.soft)}</p>
          </section>
          <Panel title="할 수 있는 일">
            <Actions life={life} onAct={act} onDialog={setDialog} />
          </Panel>
          <Panel title="올해의 초점">
            <div className="flex flex-wrap gap-2" role="group" aria-label="올해의 초점">
              {life.focusOptions().map((f) => (
                <button key={f.id} type="button" className="btn h-auto min-h-11 flex-col items-start gap-0 py-1.5 text-left text-sm" aria-pressed={p.focus === f.id}
                  onClick={() => { life.setFocus(f.id); persist(); bump(); }}>
                  <span className="font-medium">{world.text(f.label)}</span>
                  <span className="text-xs text-faint">{world.text(f.hint)}</span>
                </button>
              ))}
            </div>
            <p className="label mt-3">언제든 바꿀 수 있어요. 고르지 않으면 나이에 맞게 정해집니다.</p>
          </Panel>
          <Panel title="인생 기록">
            <Feed world={world} log={p.log} soft={settings.soft} freshFrom={freshFrom} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="인생 지도"><LifeGrid history={p.history} log={p.log} age={p.age} dead={!!p.dead} /></Panel>
          <Panel title="생존 곡선"><SurvivalChart world={world} country={p.born} sex={p.sex} age={p.age} dead={!!p.dead} /></Panel>
          <Panel title={`${countryName(world, here.id)}의 통계`}>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">기대수명 ({SEX_LABEL[p.sex]})</dt><dd className="tabular-nums">{here.lifeExp[p.sex]}세</dd>
              <dt className="text-muted">5세 전 사망 (1,000명당)</dt><dd className="tabular-nums">{num(here.u5mr, 1)}</dd>
              <dt className="text-muted">1인당 GDP (PPP)</dt><dd className="tabular-nums">{ppp(here.gdpPppPc)}</dd>
              <dt className="text-muted">합계출산율</dt><dd className="tabular-nums">{here.tfr}</dd>
              <dt className="text-muted">경제활동참가율 ({SEX_LABEL[p.sex]})</dt><dd className="tabular-nums">{pct(here.lfp[p.sex], 0)}</dd>
              <dt className="text-muted">해외에 사는 출생자</dt><dd className="tabular-nums">{pct(here.emigrantShare)}</dd>
            </dl>
            <Link href={`/c/${here.id.toLowerCase()}/`} className="mt-3 inline-block text-sm text-accent underline-offset-4 hover:underline">이 나라 통계와 출처 모두 보기</Link>
          </Panel>
        </div>
      </div>

      {decision && p.pending && (
        <DecisionDialog world={world} decision={decision} options={p.pending.options} age={Math.max(0, p.age - 1)} onChoose={choose} />
      )}
    </div>
  );
}
