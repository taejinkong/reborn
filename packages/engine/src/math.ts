// 확률·분포 계산 도구.

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const toOdds = (p: number) => p / (1 - p);
export const fromOdds = (o: number) => o / (1 + o);

/** 확률 p에 오즈비 k를 곱한다. */
export function scaleOdds(p: number, k: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return fromOdds(toOdds(p) * k);
}

/**
 * 오즈비 함수 f(x)를 분포 xs(동일 가중)에 적용했을 때 평균 확률이 base가 되도록
 * 정규화한 보정값 c를 이분법으로 찾는다. 이후 개인 확률 = scaleOdds(base, c·f(x)).
 */
export function oddsNormalizer(base: number, factors: readonly number[]): number {
  if (base <= 0 || base >= 1) return 1;
  const mean = (c: number) => factors.reduce((s, f) => s + scaleOdds(base, c * f), 0) / factors.length;
  let lo = 1e-4, hi = 1e4;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (mean(mid) < base) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** 표준정규 역누적분포 (Acklam 근사) */
export function normInv(p: number): number {
  p = clamp(p, 1e-9, 1 - 1e-9);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * 지니계수로 근사한 로그정규 소득분포의 백분위 값.
 * σ = √2 · Φ⁻¹((G + 1) / 2), 평균이 mean이 되도록 μ = ln(mean) − σ²/2.
 */
export function lognormalIncome(mean: number, gini: number, pct: number): number {
  const sigma = Math.SQRT2 * normInv((clamp(gini, 0.05, 0.9) + 1) / 2);
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * normInv(pct));
}
