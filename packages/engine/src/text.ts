// 기록 문장 렌더링. {key} 치환과 한국어 조사 {key|이/가} 처리.
import type { LogEntry } from './state.ts';
import type { World } from './world.ts';

const displayNames = new Map<string, Intl.DisplayNames>();

export function countryName(world: World, id: string, lang = 'ko'): string {
  const c = world.byId.get(id);
  if (!c) return id;
  let dn = displayNames.get(lang);
  if (!dn) displayNames.set(lang, (dn = new Intl.DisplayNames([lang], { type: 'region' })));
  try {
    return dn.of(c.iso2) ?? c.name;
  } catch {
    return c.name;
  }
}

/** 마지막 글자에 받침이 있는가 (한글이 아니면 숫자 읽기로 근사) */
function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자: 0 1 3 6 7 8 은 받침 있음 (영, 일, 삼, 육, 칠, 팔)
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  return false;
}

/** '이/가', '은/는', '을/를', '과/와', '으로/로' 중 하나 */
function particle(word: string, pair: string): string {
  const [withB, without] = pair.split('/');
  if (pair === '으로/로') {
    const code = word.trim().slice(-1).charCodeAt(0);
    const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
    return word + (hasBatchim(word) && !rieul ? withB : without);
  }
  return word + (hasBatchim(word) ? withB : without);
}

export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (_, k: string, pair?: string) => {
    const v = params[k];
    if (v === undefined) return `{${k}}`;
    const s = typeof v === 'number' ? v.toLocaleString('ko-KR') : v;
    return pair ? particle(s, pair) : s;
  });
}

export function render(world: World, e: LogEntry, lang = 'ko'): string {
  const params: Record<string, string | number> = { ...(e.params ?? {}) };
  if (typeof params.country === 'string') params.country = countryName(world, params.country, lang);
  if (typeof params.job === 'string') params.job = world.text(params.job, lang);
  return format(world.text(e.key, lang), params);
}
