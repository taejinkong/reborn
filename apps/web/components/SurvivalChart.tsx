// 생존 곡선: 같은 해 같은 나라에서 태어난 같은 성별 중 각 나이까지 살아 있는 비율 (생명표).
import type { Sex, World } from '@reborn/engine';
import { pct } from '@/lib/format';

export function survivalCurve(world: World, country: string, sex: Sex): number[] {
  const l = [1];
  for (let a = 0; a < 100; a++) l.push(l[a] * (1 - world.qx(country, sex, a)));
  return l;
}

export function SurvivalChart({ world, country, sex, age, dead }: { world: World; country: string; sex: Sex; age: number; dead: boolean }) {
  const l = survivalCurve(world, country, sex);
  const W = 300, H = 140, P = 24;
  const x = (a: number) => P + (a / 100) * (W - P - 6);
  const y = (v: number) => 6 + (1 - v) * (H - P - 6);
  const d = l.map((v, a) => `${a ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const at = Math.min(age, 100);
  const alive = l[at];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`생존 곡선. ${at}세까지 살아 있는 비율 ${pct(alive)}`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={P} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : '3 3'} />
            <text x={P - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">{v * 100}%</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((a) => <text key={a} x={x(a)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--faint)">{a}</text>)}
        <path d={`${d}L${x(100)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--accent-soft)" opacity="0.6" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <line x1={x(at)} x2={x(at)} y1={y(0)} y2={y(alive)} stroke={dead ? 'var(--heavy)' : 'var(--ink)'} strokeDasharray="2 2" />
        <circle cx={x(at)} cy={y(alive)} r="4" fill={dead ? 'var(--heavy)' : 'var(--ink)'} />
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        같은 해 같은 나라에서 태어난 사람 중 <b className="text-ink">{at}세</b>까지 살아 있는 비율은 <b className="text-ink">{pct(alive)}</b>입니다.
      </figcaption>
    </figure>
  );
}
