// 장면 그림 (임시). 7단계에서 생성형 이미지로 바꾼다. 생애 단계·도시/시골·시간대에 따라 달라지는 단순한 SVG.
import type { Person } from '@reborn/engine';

function stage(age: number): { label: string; h: number; w: number } {
  if (age < 3) return { label: '아기', h: 14, w: 12 };
  if (age < 13) return { label: '어린이', h: 26, w: 12 };
  if (age < 20) return { label: '청소년', h: 34, w: 12 };
  if (age < 65) return { label: '어른', h: 38, w: 13 };
  return { label: '노인', h: 35, w: 13 };
}

export function Scene({ p }: { p: Person }) {
  const s = stage(p.age);
  const dead = !!p.dead;
  // 나이에 따라 하루의 빛이 아침에서 저녁으로 옮겨 간다
  const t = Math.min(1, p.age / 90);
  const sky = dead ? 'var(--sunk)' : `color-mix(in srgb, #f3c28b ${Math.round(t * 70)}%, #bfd8e6)`;
  const ground = p.urban ? '#9aa1a8' : '#a9bf8a';
  const kids = p.family.children.filter((k) => k.alive).length;
  const partner = !!p.family.partner;
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" role="img" aria-label={dead ? '삶이 끝난 자리' : `${s.label}인 당신, ${p.urban ? '도시' : '시골'}`}>
      <rect width="320" height="160" fill={sky} />
      <circle cx={40 + t * 240} cy={44 - Math.sin(t * Math.PI) * 18} r="14" fill="#fff3d6" opacity={dead ? 0.3 : 0.9} />
      {p.urban ? (
        <g fill="#7d858e" opacity="0.55">
          <rect x="18" y="58" width="34" height="62" /><rect x="58" y="40" width="26" height="80" /><rect x="236" y="50" width="30" height="70" /><rect x="272" y="66" width="34" height="54" />
        </g>
      ) : (
        <g fill="#7f9a62" opacity="0.6">
          <path d="M0 120 Q60 80 120 118 T240 112 T320 116 V120 H0Z" />
          <circle cx="262" cy="96" r="16" /><rect x="259" y="104" width="6" height="16" fill="#6b5a45" />
        </g>
      )}
      <rect y="118" width="320" height="42" fill={ground} />
      {dead ? (
        <g transform="translate(160 118)">
          <rect x="-4" y="-26" width="8" height="26" rx="2" fill="#efe6d4" />
          <path d="M0 -38 C5 -32 5 -28 0 -26 C-5 -28 -5 -32 0 -38Z" fill="#e3a35a" />
        </g>
      ) : (
        <g transform="translate(160 118)" fill="var(--ink)">
          <Person h={s.h} w={s.w} x={0} bent={p.age >= 75} />
          {partner && <Person h={36} w={13} x={22} />}
          {Array.from({ length: Math.min(kids, 4) }, (_, i) => <Person key={i} h={18 + (i % 2) * 4} w={9} x={-22 - i * 14} />)}
        </g>
      )}
    </svg>
  );
}

function Person({ h, w, x, bent = false }: { h: number; w: number; x: number; bent?: boolean }) {
  const r = Math.max(4, w * 0.38);
  return (
    <g transform={`translate(${x} 0)${bent ? ' rotate(-6)' : ''}`} opacity="0.85">
      <circle cx="0" cy={-h - r} r={r} />
      <rect x={-w / 2} y={-h} width={w} height={h} rx={w / 2.5} />
    </g>
  );
}
