// Black-Scholes-Merton equity/index option pricing, Greeks, implied vol solving,
// and a put-call parity checker used to validate a live option chain.
import { bisection, newtonRaphson } from './optim';

export type OptionType = 'call' | 'put';

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26 approximation, accurate to ~1.5e-7.
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BsInputs {
  S: number; // spot
  K: number; // strike
  T: number; // time to expiry, years
  r: number; // risk-free rate (cont. comp.)
  q: number; // continuous dividend yield
  sigma: number; // volatility
  type: OptionType;
}

function d1d2(inp: Omit<BsInputs, 'type'>) {
  const { S, K, T, r, q, sigma } = inp;
  const vol = Math.max(sigma, 1e-8);
  const sqrtT = Math.sqrt(Math.max(T, 1e-8));
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  return { d1, d2, sqrtT };
}

export function bsPrice(inp: BsInputs): number {
  const { S, K, T, r, q, type } = inp;
  if (T <= 0) {
    return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const { d1, d2 } = d1d2(inp);
  const df_r = Math.exp(-r * T);
  const df_q = Math.exp(-q * T);
  if (type === 'call') {
    return S * df_q * normCdf(d1) - K * df_r * normCdf(d2);
  }
  return K * df_r * normCdf(-d2) - S * df_q * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number; // per 1.00 (100vol pts) change in sigma; UI divides by 100 for "per vol point"
  theta: number; // per year; UI divides by 365 for "per day"
  rho: number;
}

export function bsGreeks(inp: BsInputs): Greeks {
  const { S, K, T, r, q, sigma, type } = inp;
  const { d1, d2, sqrtT } = d1d2(inp);
  const df_r = Math.exp(-r * T);
  const df_q = Math.exp(-q * T);
  const sign = type === 'call' ? 1 : -1;

  const delta = sign * df_q * normCdf(sign * d1);
  const gamma = (df_q * normPdf(d1)) / (S * sigma * sqrtT);
  const vega = S * df_q * normPdf(d1) * sqrtT;
  const theta =
    -((S * df_q * normPdf(d1) * sigma) / (2 * sqrtT)) -
    sign * r * K * df_r * normCdf(sign * d2) +
    sign * q * S * df_q * normCdf(sign * d1);
  const rho = sign * K * T * df_r * normCdf(sign * d2);

  return { delta, gamma, vega, theta, rho };
}

export interface ImpliedVolResult {
  iv: number;
  converged: boolean;
  method: 'newton-raphson' | 'bisection';
  iterations: number;
}

/**
 * Solve for implied volatility given a market price. Uses Newton-Raphson with
 * vega as the derivative (fast, quadratic convergence near the solution);
 * falls back to bracketed bisection when vega collapses (deep ITM/OTM or near
 * expiry) or Newton wanders outside a sane vol range.
 */
export function impliedVol(
  marketPrice: number,
  inputs: Omit<BsInputs, 'sigma'>,
  guess = 0.3,
): ImpliedVolResult {
  const f = (sigma: number) => bsPrice({ ...inputs, sigma }) - marketPrice;
  const fp = (sigma: number) => bsGreeks({ ...inputs, sigma }).vega;

  const nr = newtonRaphson(f, fp, guess, { tol: 1e-6, maxIter: 60 });
  if (nr.converged && nr.root > 0.001 && nr.root < 5) {
    return { iv: nr.root, converged: true, method: 'newton-raphson', iterations: nr.iterations.length };
  }

  const bi = bisection(f, 0.001, 5, { tol: 1e-6, maxIter: 100 });
  return {
    iv: bi.root,
    converged: bi.converged,
    method: 'bisection',
    iterations: bi.iterations.length,
  };
}

export interface ParityCheck {
  call: number;
  put: number;
  lhs: number; // C - P
  rhs: number; // S*e^-qT - K*e^-rT
  diff: number;
  diffBps: number; // diff as bps of spot
  holds: boolean;
}

/**
 * Put-call parity for European options: C - P = S e^{-qT} - K e^{-rT}.
 * Checks *observed market* call/put prices against the theoretical relation.
 */
export function checkPutCallParity(
  callPrice: number,
  putPrice: number,
  S: number,
  K: number,
  r: number,
  q: number,
  T: number,
  toleranceBps = 25,
): ParityCheck {
  const lhs = callPrice - putPrice;
  const rhs = S * Math.exp(-q * T) - K * Math.exp(-r * T);
  const diff = lhs - rhs;
  const diffBps = (diff / S) * 10000;
  return { call: callPrice, put: putPrice, lhs, rhs, diff, diffBps, holds: Math.abs(diffBps) <= toleranceBps };
}
