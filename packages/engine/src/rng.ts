// 시드 기반 난수. 같은 시드 → 같은 삶.

/** 문자열 시드를 128비트 상태로 펼친다 (cyrb128). */
function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** xoshiro128** 생성기. 상태를 직렬화해 저장·복원할 수 있다. */
export class Rng {
  private s: [number, number, number, number];

  constructor(seed: string | [number, number, number, number]) {
    this.s = typeof seed === 'string' ? hashSeed(seed) : [...seed];
    if (this.s.every((v) => v === 0)) this.s[0] = 1;
  }

  get state(): [number, number, number, number] {
    return [...this.s];
  }

  /** [0, 1) 균등분포 */
  next(): number {
    const s = this.s;
    const r = Math.imul(rotl(Math.imul(s[1], 5), 7), 9);
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return (r >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** [lo, hi] 정수 */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** 가중치 추첨. 가중치가 모두 0이면 null. */
  weighted<T>(items: readonly T[], weight: (x: T) => number): T | null {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** 표준정규분포 (Box–Muller) */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  /** 포아송 분포 (작은 λ용 Knuth 방식) */
  poisson(lambda: number): number {
    const lim = Math.exp(-lambda);
    let k = 0, p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > lim);
    return k - 1;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}
