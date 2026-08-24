// Garman-Kohlhagen FX option pricing (Black-Scholes with a foreign "dividend"
// yield equal to the foreign risk-free rate), forward points, and FX put-call
// parity expressed against the forward rate — the market-standard form.
import { bisection, newtonRaphson } from './optim';
import { bsGreeks, bsPrice, normCdf, type Greeks, type OptionType } from './options';

export interface GkInputs {
  S: number; // spot, domestic per 1 foreign unit (e.g. USD per EUR)
  K: number; // strike
  T: number; // years
  rd: number; // domestic risk-free rate
  rf: number; // foreign risk-free rate
  sigma: number;
  type: OptionType;
}

/** Garman-Kohlhagen price = Black-Scholes price with q -> rf. */
export function gkPrice(inp: GkInputs): number {
  return bsPrice({ S: inp.S, K: inp.K, T: inp.T, r: inp.rd, q: inp.rf, sigma: inp.sigma, type: inp.type });
}

export function gkGreeks(inp: GkInputs): Greeks {
  return bsGreeks({ S: inp.S, K: inp.K, T: inp.T, r: inp.rd, q: inp.rf, sigma: inp.sigma, type: inp.type });
}

export function fxForward(S: number, rd: number, rf: number, T: number): number {
  return S * Math.exp((rd - rf) * T);
}

/** Forward-delta: the standard FX-market delta quote convention (delta w.r.t. forward, not spot). */
export function forwardDelta(inp: GkInputs): number {
  const F = fxForward(inp.S, inp.rd, inp.rf, inp.T);
  const vol = Math.max(inp.sigma, 1e-8);
  const sqrtT = Math.sqrt(Math.max(inp.T, 1e-8));
  const d1 = (Math.log(F / inp.K) + 0.5 * vol * vol * inp.T) / (vol * sqrtT);
  return inp.type === 'call' ? normCdf(d1) : normCdf(d1) - 1;
}

export interface FxImpliedVolResult {
  iv: number;
  converged: boolean;
  method: 'newton-raphson' | 'bisection';
  iterations: number;
}

export function fxImpliedVol(
  marketPrice: number,
  inputs: Omit<GkInputs, 'sigma'>,
  guess = 0.1,
): FxImpliedVolResult {
  const f = (sigma: number) => gkPrice({ ...inputs, sigma }) - marketPrice;
  const fp = (sigma: number) => gkGreeks({ ...inputs, sigma }).vega;

  const nr = newtonRaphson(f, fp, guess, { tol: 1e-7, maxIter: 60 });
  if (nr.converged && nr.root > 0.0005 && nr.root < 3) {
    return { iv: nr.root, converged: true, method: 'newton-raphson', iterations: nr.iterations.length };
  }
  const bi = bisection(f, 0.0005, 3, { tol: 1e-7, maxIter: 100 });
  return { iv: bi.root, converged: bi.converged, method: 'bisection', iterations: bi.iterations.length };
}

export interface FxParityCheck {
  call: number;
  put: number;
  forward: number;
  lhs: number; // C - P
  rhs: number; // (F - K) e^{-rd T}
  diff: number;
  diffPips: number;
  holds: boolean;
}

/**
 * FX put-call parity via the forward: C - P = (F - K) e^{-rd T}, where
 * F = S e^{(rd-rf)T}. Equivalent to the spot form but the FX market quotes
 * and risk-manages against the forward, so this is the natural check here.
 */
export function checkFxPutCallParity(
  callPrice: number,
  putPrice: number,
  S: number,
  K: number,
  rd: number,
  rf: number,
  T: number,
  pipFactor = 10000,
  toleranceBps = 25,
): FxParityCheck {
  const F = fxForward(S, rd, rf, T);
  const lhs = callPrice - putPrice;
  const rhs = (F - K) * Math.exp(-rd * T);
  const diff = lhs - rhs;
  return {
    call: callPrice,
    put: putPrice,
    forward: F,
    lhs,
    rhs,
    diff,
    diffPips: diff * pipFactor,
    holds: Math.abs((diff / S) * 10000) <= toleranceBps,
  };
}
