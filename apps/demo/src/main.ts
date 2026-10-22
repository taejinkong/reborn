// Reborn 엔진 데모: 출생 → 1년씩 진행 → 갈림길 → 사망 기록.
import { Life, World, birthOdds, countryName, render, type DecisionDef, type LogEntry, type BirthMode } from '@reborn/engine';
import countries from '../../../data/build/countries.json';
import lifetable from '../../../data/build/lifetables/2023.json';
import content from '../../../content/build/content.json';

const world = new World({ countries: countries as never, lifetable: lifetable as never, content });
const app = document.getElementById('app')!;
const modal = document.getElementById('modal')!;

const STAT_LABEL = { health: '건강', happiness: '행복', knowledge: '지식', relations: '관계' } as const;
const EDU_LABEL = { none: '학교 안 다님', primary: '초등 졸업', secondary: '중등 졸업', tertiary: '대학 졸업', graduate: '대학원 졸업' } as const;
const SCHOOL_LABEL = { primary: '초등학교 재학 중', secondary: '중등학교 재학 중', tertiary: '대학 재학 중' } as const;
const HOUSEHOLD = ['', '아주 어려움', '어려움', '보통', '넉넉함', '아주 넉넉함'];
/** 1년이 흐르는 데 걸리는 실제 시간(초). 0은 멈춤 */
const SPEEDS = [{ label: '❚❚', sec: 0 }, { label: '느리게', sec: 4 }, { label: '보통', sec: 1.5 }, { label: '빠르게', sec: 0.4 }];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const name = (id: string) => countryName(world, id);
const won = (usd: number) => `${Math.round(usd).toLocaleString('ko-KR')} 달러`;

let mode: BirthMode = 'births';
let life: Life | null = null;
let speed = 2;
let auto = false;
let timer = 0;
let acc = 0;
let fresh = 0;

// ── 첫 화면 ─────────────────────────────────────────────
function intro(): void {
  stop();
  const top = [...world.countries].sort((a, b) => b[mode === 'births' ? 'births' : 'population'] - a[mode === 'births' ? 'births' : 'population']).slice(0, 10);
  const max = birthOdds(world, top[0], mode);
  const total = world.countries.reduce((s, c) => s + c.births, 0);
  app.innerHTML = `
  <div class="wrap">
    <span class="tag">엔진 데모 v0 · ${world.countries.length}개 국가·지역 · UN·세계은행 통계</span>
    <h1>Re<em>born</em></h1>
    <p class="lede">지금 이 순간에도 1초에 약 ${(total / 365 / 86400).toFixed(1)}명의 아기가 태어납니다. 당신은 그중 한 명이 됩니다. 어디서, 어떤 집에서 태어날지는 고를 수 없습니다.</p>
    <div class="grid intro" style="margin-top:24px">
      <section class="card odds">
        <h2>${mode === 'births' ? '지금 태어나는 아기라면' : '지금 사는 사람이라면'}</h2>
        <ul>${top.map((c) => {
          const p = birthOdds(world, c, mode);
          return `<li><span>${esc(name(c.id))}</span><span class="bar"><i style="width:${(p / max) * 100}%"></i></span><span class="num">${(p * 100).toFixed(1)}%</span></li>`;
        }).join('')}</ul>
      </section>
      <section class="card">
        <h2>나라를 뽑는 기준</h2>
        <div class="row">
          <button class="btn" data-mode="births" aria-pressed="${mode === 'births'}">연간 출생아 수</button>
          <button class="btn" data-mode="population" aria-pressed="${mode === 'population'}">현재 인구</button>
        </div>
        <p class="muted">출생 기준이면 지금 태어나는 아기의 실제 분포대로, 인구 기준이면 지금 사는 사람들의 분포대로 뽑습니다.</p>
        <div style="margin-top:20px"><button class="cta" id="start">태어나기</button></div>
        <p class="muted" style="margin-top:16px">죽음과 상실 같은 무거운 일도 통계대로 일어납니다. 장면은 그리지 않습니다.</p>
      </section>
    </div>
    <footer>통계: UN World Population Prospects 2024 (CC BY 3.0 IGO), World Bank WDI (CC BY 4.0). 이 데모는 개발 중인 시뮬레이션 엔진을 확인하기 위한 화면입니다.</footer>
  </div>`;
  app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode as BirthMode; intro(); }));
  document.getElementById('start')!.onclick = () => {
    life = Life.born(world, { mode });
    fresh = life.p.log.length;
    renderLife();
    play();
  };
}

// ── 인생 화면 ───────────────────────────────────────────
function renderLife(): void {
  const l = life!, p = l.p;
  const c = world.country(p.born);
  const focus = l.focusOptions();
  const entries = [...p.log].reverse();
  app.innerHTML = `
  <header class="top"><div class="wrap">
    <div class="row"><span class="age">${p.age}<small>세 · ${p.year}년</small></span></div>
    <div class="row">
      ${SPEEDS.map((s, i) => `<button class="btn" data-speed="${i}" aria-pressed="${speed === i}">${s.label}</button>`).join('')}
      <button class="btn" id="auto" aria-pressed="${auto}" title="갈림길을 자동으로 고릅니다">자동 결정</button>
      <button class="btn" id="quit">처음으로</button>
    </div>
  </div></header>
  <div class="wrap grid life">
    <aside class="grid" style="align-content:start">
      <section class="card">
        <h2>당신</h2>
        ${(Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((k) => `
          <div class="stat"><span>${STAT_LABEL[k]}</span><span class="bar"><i style="width:${p.stats[k]}%;background:var(--st-${k})"></i></span><span class="num">${Math.round(p.stats[k])}</span></div>`).join('')}
        <dl>
          <dt>태어난 곳</dt><dd>${esc(name(p.born))} · ${p.urban ? '도시' : '시골'}</dd>
          <dt>성별</dt><dd>${p.sex === 'F' ? '여성' : '남성'}</dd>
          <dt>집안 형편</dt><dd>${HOUSEHOLD[p.household]}</dd>
          <dt>학력</dt><dd>${p.edu.school ? SCHOOL_LABEL[p.edu.school.stage] : EDU_LABEL[p.edu.level]}</dd>
          <dt>일</dt><dd>${p.job ? esc(world.text(world.jobs.get(p.job)!.label)) : p.retired ? '은퇴' : '없음'}</dd>
          <dt>연 소득</dt><dd>${p.money.income > 0 ? `${won(p.money.income)} <span class="muted">(PPP)</span>` : '—'}</dd>
          <dt>가족</dt><dd>${[
            p.family.mother.alive ? '어머니' : null, p.family.father.alive ? '아버지' : null,
            p.family.siblings ? `형제자매 ${p.family.siblings}` : null,
            p.family.partner ? (p.family.partner.married ? '배우자' : '연인') : null,
            p.family.children.filter((k) => k.alive).length ? `자녀 ${p.family.children.filter((k) => k.alive).length}` : null,
          ].filter(Boolean).join(' · ') || '혼자'}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${esc(name(c.id))}의 통계</h2>
        <dl>
          <dt>기대수명</dt><dd>${c.lifeExp[p.sex]}세 (${p.sex === 'F' ? '여성' : '남성'})</dd>
          <dt>5세 전 사망</dt><dd>1,000명 중 ${c.u5mr}명</dd>
          <dt>1인당 GDP</dt><dd>${won(c.gdpPppPc)} (PPP)</dd>
          <dt>합계출산율</dt><dd>${c.tfr}</dd>
          <dt>도시 인구</dt><dd>${Math.round(c.urban * 100)}%</dd>
        </dl>
        <p class="muted">출처: UN WPP 2024, World Bank WDI${c.estimated.length ? ` · 일부 지역 평균 추정` : ''}</p>
      </section>
    </aside>
    <section class="grid" style="align-content:start">
      <div class="card">
        <h2>올해의 초점</h2>
        <div class="chips">${focus.map((f) => `<button class="chip" data-focus="${f.id}" aria-pressed="${p.focus === f.id}">${esc(world.text(f.label))}<small>${esc(world.text(f.hint))}</small></button>`).join('')}</div>
      </div>
      <div class="card">
        <h2>인생 기록</h2>
        <ul class="feed">${entries.map((e, i) => `<li class="${e.tone === 'heavy' ? 'heavy' : ''} ${entries.length - i > fresh ? 'fresh' : ''}"><span class="a">${e.age}세</span><span>${esc(render(world, e))}</span></li>`).join('')}</ul>
      </div>
    </section>
  </div>`;
  fresh = p.log.length;
  app.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => (b.onclick = () => { speed = Number(b.dataset.speed); renderLife(); play(); }));
  app.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((b) => (b.onclick = () => { l.setFocus(b.dataset.focus!); renderLife(); }));
  document.getElementById('auto')!.onclick = () => { auto = !auto; renderLife(); if (auto && l.p.pending) { closeModal(); l.autoChoose(); renderLife(); play(); } };
  document.getElementById('quit')!.onclick = intro;
}

// ── 시간 흐름 ──────────────────────────────────────────
function stop(): void {
  if (timer) cancelAnimationFrame(timer);
  timer = 0;
}

function play(): void {
  stop();
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    const sec = SPEEDS[speed].sec;
    if (life && sec > 0 && !life.p.pending && !life.p.dead) {
      acc += dt;
      if (acc >= sec) {
        acc = 0;
        yearPasses();
      }
    }
    if (life && !life.p.dead) timer = requestAnimationFrame(loop);
  };
  timer = requestAnimationFrame(loop);
}

function yearPasses(): void {
  const l = life!;
  const r = l.step();
  if (r.died) {
    stop();
    renderLife();
    setTimeout(ending, 1200);
    return;
  }
  if (r.decision) {
    if (auto) l.autoChoose();
    else openDecision(r.decision);
  }
  renderLife();
}

function openDecision(d: DecisionDef): void {
  const l = life!;
  const opts = d.options.filter((o) => l.p.pending!.options.includes(o.id));
  modal.innerHTML = `<div class="card dialog" role="dialog" aria-modal="true">
    <p class="muted">${l.p.age - 1}세</p>
    <h2>${esc(world.text(d.title))}</h2>
    <p>${esc(world.text(d.body))}</p>
    ${opts.map((o) => `<button class="opt" data-opt="${o.id}">${esc(world.text(o.label))}${o.hint ? `<small>${esc(world.text(o.hint))}</small>` : ''}</button>`).join('')}
  </div>`;
  modal.hidden = false;
  modal.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => (b.onclick = () => {
    l.choose(b.dataset.opt!);
    closeModal();
    renderLife();
  }));
}

function closeModal(): void {
  modal.hidden = true;
  modal.innerHTML = '';
}

// ── 사망 기록 ──────────────────────────────────────────
function ending(): void {
  const l = life!, p = l.p, d = p.dead!;
  const c = world.country(p.born);
  const le = c.lifeExp[p.sex];
  const diff = d.age + 0.5 - le;
  const key = p.log.filter((e: LogEntry) => e.tone !== 'light' || e.tags?.some((t) => ['achievement', 'love', 'family', 'milestone', 'new_start'].includes(t)));
  app.innerHTML = `<div class="wrap end">
    <span class="tag">${p.birthYear}년 – ${d.year}년</span>
    <h1 style="font-size:clamp(36px,7vw,64px)">${d.age}세</h1>
    <p class="lede">${esc(render(world, p.log[p.log.length - 1]))}</p>
    <p class="cmp">${esc(name(p.born))}에서 태어난 ${p.sex === 'F' ? '여성' : '남성'}의 기대수명은 ${le}세입니다. 당신은 그보다 ${Math.abs(diff).toFixed(0)}년 ${diff >= 0 ? '더' : '덜'} 살았습니다.</p>
    <div class="card" style="margin-top:20px">
      <h2>당신의 일생</h2>
      <ul class="feed" style="max-height:none">${key.map((e) => `<li class="${e.tone === 'heavy' ? 'heavy' : ''}"><span class="a">${e.age}세</span><span>${esc(render(world, e))}</span></li>`).join('')}</ul>
    </div>
    <div class="row" style="margin-top:20px"><button class="cta" id="again">다시 태어나기</button><button class="btn" id="home">처음으로</button></div>
    <p class="muted" style="margin-top:12px">시드 ${esc(p.seed)} — 같은 시드와 같은 선택이면 같은 삶이 다시 펼쳐집니다.</p>
  </div>`;
  document.getElementById('again')!.onclick = () => { life = Life.born(world, { mode }); fresh = life.p.log.length; renderLife(); play(); };
  document.getElementById('home')!.onclick = intro;
}

intro();
