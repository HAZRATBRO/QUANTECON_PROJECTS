// Realized volatility estimation and implied-volatility-surface construction.
//
// Surface method (documented in the UI explainer too):
//   1. Group live quotes by expiry; for each expiry, convert market price ->
//      implied vol (Newton-Raphson, see options.ts/fx.ts) for every strike.
//   2. Fit a quadratic smile  sigma(k) = a + b*k + c*k^2  in log-moneyness
//      k = ln(K/F) per expiry via closed-form ordinary least squares.
//   3. Convert each fitted smile to *total variance* w(k,T) = sigma(k,T)^2 * T
//      on a common moneyness grid, then interpolate w linearly across expiries
//      at each grid moneyness (linear-in-total-variance is the standard
//      market convention: it keeps the calendar spread of variance
//      non-negative when the inputs already are, avoiding an obvious
//      calendar arbitrage that naive vol-linear interpolation can introduce).
//   4. Convert back to volatility: sigma(k,T) = sqrt(w(k,T)/T).
import { linspace, solveLinear } from './optim';

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) out.push(Math.log(prices[i] / prices[i - 1]));
  return out;
}

export function stdev(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Annualized close-to-close realized volatility over a trailing window. */
export function realizedVol(prices: number[], annualizationDays = 252): number {
  const rets = logReturns(prices);
  return stdev(rets) * Math.sqrt(annualizationDays);
}

/** Rolling realized vol series, one point per day once `window` returns are available. */
export function rollingRealizedVol(
  prices: number[],
  window = 21,
  annualizationDays = 252,
): { index: number; vol: number }[] {
  const rets = logReturns(prices);
  const out: { index: number; vol: number }[] = [];
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    out.push({ index: i, vol: stdev(slice) * Math.sqrt(annualizationDays) });
  }
  return out;
}

export interface SmileFit {
  T: number;
  a: number;
  b: number;
  c: number;
  points: { k: number; iv: number }[];
}

/** Closed-form OLS fit of sigma(k) = a + b k + c k^2 via normal equations. */
export function fitQuadraticSmile(T: number, points: { k: number; iv: number }[]): SmileFit {
  const n = points.length;
  let S0 = n,
    S1 = 0,
    S2 = 0,
    S3 = 0,
    S4 = 0,
    Y0 = 0,
    Y1 = 0,
    Y2 = 0;
  for (const { k, iv } of points) {
    const k2 = k * k;
    S1 += k;
    S2 += k2;
    S3 += k2 * k;
    S4 += k2 * k2;
    Y0 += iv;
    Y1 += k * iv;
    Y2 += k2 * iv;
  }
  if (n < 3) {
    const meanIv = points.reduce((s, p) => s + p.iv, 0) / Math.max(n, 1);
    return { T, a: meanIv || 0.2, b: 0, c: 0, points };
  }
  const A = [
    [S0, S1, S2],
    [S1, S2, S3],
    [S2, S3, S4],
  ];
  const b = [Y0, Y1, Y2];
  const [a0, a1, a2] = solveLinear(A, b);
  return { T, a: a0, b: a1, c: a2, points };
}

export function smileVol(fit: SmileFit, k: number): number {
  return Math.max(fit.a + fit.b * k + fit.c * k * k, 0.01);
}

export interface VolSurfaceGrid {
  moneyness: number[]; // log-moneyness grid, x-axis
  tenors: number[]; // years, y-axis
  iv: number[][]; // iv[tenorIndex][moneynessIndex]
  smiles: SmileFit[];
}

/**
 * Build a full (moneyness x tenor) implied-vol surface from per-expiry smile
 * fits by interpolating total variance across tenors (step 3/4 above).
 */
export function buildVolSurface(
  smiles: SmileFit[],
  moneynessRange: [number, number] = [-0.4, 0.4],
  nK = 25,
  nT = 25,
): VolSurfaceGrid {
  const sorted = [...smiles].sort((a, b) => a.T - b.T);
  const moneyness = linspace(moneynessRange[0], moneynessRange[1], nK);
  const minT = sorted[0]?.T ?? 0.05;
  const maxT = sorted[sorted.length - 1]?.T ?? 2;
  const tenors = linspace(minT, maxT, nT);

  // total variance at each fitted tenor, across the moneyness grid
  const varAtFittedT = sorted.map((fit) => moneyness.map((k) => smileVol(fit, k) ** 2 * fit.T));

  const iv: number[][] = tenors.map((T) => {
    if (sorted.length === 1) {
      return moneyness.map((_, i) => Math.sqrt(varAtFittedT[0][i] / T));
    }
    let lo = 0;
    while (lo < sorted.length - 2 && sorted[lo + 1].T < T) lo++;
    const hi = lo + 1;
    const Tlo = sorted[lo].T;
    const Thi = sorted[hi].T;
    const w = Thi === Tlo ? 0 : (T - Tlo) / (Thi - Tlo);
    return moneyness.map((_, i) => {
      const varLo = varAtFittedT[lo][i];
      const varHi = varAtFittedT[hi][i];
      const varT = varLo + w * (varHi - varLo);
      return Math.sqrt(Math.max(varT, 1e-6) / Math.max(T, 1e-6));
    });
  });

  return { moneyness, tenors, iv, smiles: sorted };
}
