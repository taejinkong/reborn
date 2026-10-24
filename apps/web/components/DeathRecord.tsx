'use client';
import { countryName, type Person, type World } from '@reborn/engine';
import Link from 'next/link';
import { EDU_LABEL, SEX_LABEL, pct } from '@/lib/format';
import type { LifeSummary } from '@/lib/storage';
import { Icon } from './Icon';
import { LifeGrid } from './LifeGrid';
import { SurvivalChart, survivalCurve } from './SurvivalChart';

function Spark({ p }: { p: Person }) {
  const W = 300, H = 60;
  const xs = p.history;
  if (xs.length < 2) return null;
  const line = (k: 'happiness' | 'health') => xs.map((h, i) => `${i ? 'L' : 'M'}${((i / (xs.length - 1)) * W).toFixed(1)},${(H - (h.stats[k] / 100) * H).toFixed(1)}`).join('');
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label="일생의 행복과 건강 변화">
        <path d={line('health')} fill="none" stroke="var(--st-health)" strokeWidth="1.6" />
        <path d={line('happiness')} fill="none" stroke="var(--st-happiness)" strokeWidth="1.6" />
      </svg>
      <figcaption className="label mt-1"><span style={{ color: 'var(--st-happiness)' }}>━</span> 행복 <span className="ml-3" style={{ color: 'var(--st-health)' }}>━</span> 건강</figcaption>
    </figure>
  );
}

/** 공유용 이미지 (1080×1350) */
async function shareImage(world: World, p: Person, s: LifeSummary): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  cv.width = 1080; cv.height = 1350;
  const g = cv.getContext('2d');
  if (!g) return null;
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue('--font-serif-kr').trim() || 'serif';
  const sans = css.getPropertyValue('--font-sans-kr').trim() || 'sans-serif';
  g.fillStyle = '#f5f2ec'; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#245e5a'; g.fillRect(0, 0, 1080, 14);
  g.fillStyle = '#1d2230';
  g.font = `700 44px ${serif}`; g.fillText('Reborn', 80, 120);
  g.font = `500 34px ${sans}`; g.fillStyle = '#545a68';
  g.fillText(`${p.birthYear} – ${s.deathYear} · ${countryName(world, p.born)} · ${SEX_LABEL[p.sex]}`, 80, 190);
  g.fillStyle = '#1d2230'; g.font = `700 220px ${serif}`; g.fillText(`${s.deathAge}세`, 70, 440);
  g.font = `400 36px ${sans}`;
  const wrap = (text: string, x: number, y: number, max: number, lh: number) => {
    let line = '', yy = y;
    for (const ch of text) {
      if (g.measureText(line + ch).width > max) { g.fillText(line, x, yy); line = ch; yy += lh; } else line += ch;
    }
    g.fillText(line, x, yy);
    return yy + lh;
  };
  let y = wrap(s.epitaph, 80, 540, 920, 54) + 20;
  g.fillStyle = '#545a68'; g.font = `400 30px ${sans}`;
  for (const h of s.highlights.filter((x) => x.age > 0).slice(-6)) {
    if (y > 1200) break;
    y = wrap(`${h.age}세 · ${h.text}`, 80, y, 920, 44) + 8;
  }
  g.fillStyle = '#7b8090'; g.font = `400 26px ${sans}`;
  g.fillText('실제 통계 위에서 산 한 번의 삶', 80, 1290);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export function DeathRecord({ world, p, summary, onAgain }: { world: World; p: Person; summary: LifeSummary; onAgain: () => void }) {
  const d = p.dead!;
  const c = world.country(p.born);
  const le = c.lifeExp[p.sex];
  const diff = d.age + 0.5 - le;
  const l = survivalCurve(world, p.born, p.sex);
  const outlived = 1 - l[Math.min(d.age + 1, 100)];
  const share = async () => {
    const blob = await shareImage(world, p, summary);
    if (!blob) return;
    const file = new File([blob], `reborn-${p.seed.slice(0, 6)}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Reborn', text: summary.epitaph }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  };
  return (
    <div className="mx-auto max-w-5xl px-4 rise">
      <p className="label">{p.birthYear}년 – {d.year}년 · {countryName(world, p.born)} · {SEX_LABEL[p.sex]}</p>
      <h1 className="mt-2 font-serif text-6xl font-bold sm:text-7xl">{d.age}세</h1>
      <p className="mt-4 max-w-2xl text-lg">{summary.epitaph}</p>
      <p className="mt-3 max-w-2xl text-muted">
        {countryName(world, p.born)}에서 태어난 {SEX_LABEL[p.sex]}의 기대수명은 {le}세입니다. 당신은 그보다 {Math.abs(diff).toFixed(0)}년 {diff >= 0 ? '더' : '덜'} 살았고,
        같은 해 태어난 사람 중 <b className="text-ink">{pct(outlived, 0)}</b>보다 오래 살았습니다.
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <section className="card p-5" aria-labelledby="sum-title">
          <h2 id="sum-title" className="font-serif text-lg font-bold">당신의 삶</h2>
          <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-faint">학력</dt><dd>{EDU_LABEL[summary.edu]}</dd>
            <dt className="text-faint">마지막 일</dt><dd>{summary.job ?? '—'}</dd>
            <dt className="text-faint">결혼</dt><dd>{summary.married ? '했음' : '하지 않음'}</dd>
            <dt className="text-faint">자녀</dt><dd>{summary.children ? `${summary.children}명` : '없음'}</dd>
            <dt className="text-faint">살았던 나라</dt><dd>{summary.livedIn.map((id) => countryName(world, id)).join(' → ')}</dd>
          </dl>
          <div className="mt-5"><Spark p={p} /></div>
          <div className="mt-5"><SurvivalChart world={world} country={p.born} sex={p.sex} age={d.age} dead /></div>
        </section>
        <section className="card p-5" aria-labelledby="map-title">
          <h2 id="map-title" className="font-serif text-lg font-bold">인생 지도</h2>
          <div className="mt-3"><LifeGrid history={p.history} log={p.log} age={d.age} dead /></div>
        </section>
      </div>

      <section className="card mt-4 p-5" aria-labelledby="tl-title">
        <h2 id="tl-title" className="font-serif text-lg font-bold">기록</h2>
        <ol className="mt-3 divide-y divide-line">
          {summary.highlights.map((h, i) => (
            <li key={i} className="grid grid-cols-[3.25rem_1fr] gap-3 py-2 text-[15px]"><span className="tabular-nums text-faint">{h.age}세</span><span>{h.text}</span></li>
          ))}
        </ol>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary h-12 px-6" onClick={onAgain}>다시 태어나기</button>
        <button type="button" className="btn h-12" onClick={share}><Icon name="share" />이미지로 공유</button>
        <Link href="/lives/" className="btn h-12">전생 기록</Link>
      </div>
      <p className="label mt-4">시드 {p.seed} · 같은 시드와 같은 선택이면 같은 삶이 다시 펼쳐집니다.</p>
    </div>
  );
}
