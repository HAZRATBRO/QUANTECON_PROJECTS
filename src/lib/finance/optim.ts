// Small, dependency-free numerical routines shared across the bond, options and FX pages.
// Kept generic (not finance-specific) so every page can point at the same algorithm code.

export interface NewtonStep {
  iter: number;
  x: number;
  fx: number;
  fpx: number;
}

export interface NewtonResult {
  root: number;
  converged: boolean;
  iterations: NewtonStep[];
}

/**
 * Classic Newton-Raphson root find: x_{k+1} = x_k - f(x_k)/f'(x_k).
 * Falls back to failure (converged=false) rather than throwing, so callers can
 * decide whether to retry with bisection.
 */
export function newtonRaphson(
  f: (x: number) => number,
  fprime: (x: number) => number,
  x0: number,
  opts: { tol?: number; maxIter?: number } = {},
): NewtonResult {
  const tol = opts.tol ?? 1e-8;
  const maxIter = opts.maxIter ?? 50;
  const iterations: NewtonStep[] = [];
  let x = x0;

  for (let iter = 0; iter < maxIter; iter++) {
    const fx = f(x);
    const fpx = fprime(x);
    iterations.push({ iter, x, fx, fpx });

    if (Math.abs(fx) < tol) {
      return { root: x, converged: true, iterations };
    }
    if (Math.abs(fpx) < 1e-14 || !Number.isFinite(fpx)) {
      return { root: x, converged: false, iterations };
    }
    const next = x - fx / fpx;
    if (!Number.isFinite(next)) {
      return { root: x, converged: false, iterations };
    }
    x = next;
  }
  return { root: x, converged: Math.abs(f(x)) < tol * 10, iterations };
}

export interface BisectionResult {
  root: number;
  converged: boolean;
  iterations: { iter: number; a: number; b: number; mid: number; fmid: number }[];
}

/** Bracketed bisection fallback used when Newton-Raphson fails to converge (e.g. deep OTM implied vol). */
export function bisection(
  f: (x: number) => number,
  a0: number,
  b0: number,
  opts: { tol?: number; maxIter?: number } = {},
): BisectionResult {
  const tol = opts.tol ?? 1e-8;
  const maxIter = opts.maxIter ?? 100;
  let a = a0;
  let b = b0;
  let fa = f(a);
  const iterations: BisectionResult['iterations'] = [];

  if (fa === 0) return { root: a, converged: true, iterations };

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = 0.5 * (a + b);
    const fmid = f(mid);
    iterations.push({ iter, a, b, mid, fmid });
    if (Math.abs(fmid) < tol || (b - a) / 2 < tol) {
      return { root: mid, converged: true, iterations };
    }
    if (Math.sign(fmid) === Math.sign(fa)) {
      a = mid;
      fa = fmid;
    } else {
      b = mid;
    }
  }
  return { root: 0.5 * (a + b), converged: false, iterations };
}

/**
 * Nelder-Mead downhill simplex minimizer (derivative-free). Used to fit the
 * Nelson-Siegel yield-curve parameters, where an analytic gradient is awkward.
 */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: { tol?: number; maxIter?: number; step?: number } = {},
): { x: number[]; fval: number; iterations: number } {
  const n = x0.length;
  const tol = opts.tol ?? 1e-10;
  const maxIter = opts.maxIter ?? 2000;
  const step = opts.step ?? 0.1;

  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;

  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += p[i] !== 0 ? p[i] * step : step;
    simplex.push(p);
  }
  let values = simplex.map(f);

  let iter = 0;
  for (; iter < maxIter; iter++) {
    const order = values
      .map((v, i) => [v, i] as const)
      .sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    values = order.map(([v]) => v);

    if (Math.abs(values[n] - values[0]) < tol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    }

    const worst = simplex[n];
    const reflected = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fReflected = f(reflected);

    if (fReflected < values[0]) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const fExpanded = f(expanded);
      if (fExpanded < fReflected) {
        simplex[n] = expanded;
        values[n] = fExpanded;
      } else {
        simplex[n] = reflected;
        values[n] = fReflected;
      }
      continue;
    }
    if (fReflected < values[n - 1]) {
      simplex[n] = reflected;
      values[n] = fReflected;
      continue;
    }
    const contracted = centroid.map((c, j) => c + rho * (worst[j] - c));
    const fContracted = f(contracted);
    if (fContracted < values[n]) {
      simplex[n] = contracted;
      values[n] = fContracted;
      continue;
    }
    for (let i = 1; i <= n; i++) {
      simplex[i] = simplex[i].map((v, j) => simplex[0][j] + sigma * (v - simplex[0][j]));
      values[i] = f(simplex[i]);
    }
  }

  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  return { x: simplex[order[0][1]], fval: order[0][0], iterations: iter };
}

/** Solve a small linear system Ax=b via Gaussian elimination with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-14) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pv;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-14));
}

export function linspace(a: number, b: number, n: number): number[] {
  if (n === 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}
