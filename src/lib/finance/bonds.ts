// Fixed-income analytics: coupon-bond pricing, Newton-Raphson yield solving,
// duration/convexity, zero-curve bootstrapping, and a Nelson-Siegel curve fit.
import { linspace, nelderMead, newtonRaphson, type NewtonResult } from './optim';

export interface BondInstrument {
  id: string;
  label: string;
  type: 'bill' | 'note' | 'bond';
  maturityYears: number;
  couponRate: number; // annual coupon rate, 0 for bills
  price: number; // clean price per 100 face
  freq: 2 | 1; // coupon frequency per year
}

export interface CashflowPoint {
  t: number; // time in years
  cf: number; // cashflow amount
}

export function generateCashflows(inst: BondInstrument, faceValue = 100): CashflowPoint[] {
  if (inst.type === 'bill' || inst.couponRate === 0) {
    return [{ t: inst.maturityYears, cf: faceValue }];
  }
  const freq = inst.freq;
  const n = Math.round(inst.maturityYears * freq);
  const coupon = (inst.couponRate * faceValue) / freq;
  const flows: CashflowPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / freq;
    flows.push({ t, cf: i === n ? coupon + faceValue : coupon });
  }
  return flows;
}

/** Price of a bond given a flat yield-to-maturity `y` (periodic compounding at `freq`). */
export function priceFromYield(flows: CashflowPoint[], y: number, freq: number): number {
  return flows.reduce((sum, { t, cf }) => sum + cf / Math.pow(1 + y / freq, t * freq), 0);
}

/** dPrice/dy, analytic derivative used as Newton-Raphson's f'(y). */
export function dPriceDy(flows: CashflowPoint[], y: number, freq: number): number {
  return flows.reduce(
    (sum, { t, cf }) => sum - (t * cf) / Math.pow(1 + y / freq, t * freq + 1),
    0,
  );
}

export interface YtmSolution extends NewtonResult {
  ytm: number;
}

/** Solve yield-to-maturity for a target clean price via Newton-Raphson on price(y) - target = 0. */
export function solveYtm(
  flows: CashflowPoint[],
  targetPrice: number,
  freq: number,
  guess = 0.05,
): YtmSolution {
  const f = (y: number) => priceFromYield(flows, y, freq) - targetPrice;
  const fp = (y: number) => dPriceDy(flows, y, freq);
  const result = newtonRaphson(f, fp, guess, { tol: 1e-9, maxIter: 40 });
  return { ...result, ytm: result.root };
}

export function macaulayDuration(flows: CashflowPoint[], y: number, freq: number): number {
  const price = priceFromYield(flows, y, freq);
  const weighted = flows.reduce(
    (sum, { t, cf }) => sum + (t * cf) / Math.pow(1 + y / freq, t * freq),
    0,
  );
  return weighted / price;
}

export function modifiedDuration(flows: CashflowPoint[], y: number, freq: number): number {
  return macaulayDuration(flows, y, freq) / (1 + y / freq);
}

export function convexity(flows: CashflowPoint[], y: number, freq: number): number {
  const price = priceFromYield(flows, y, freq);
  const sum = flows.reduce((acc, { t, cf }) => {
    const n = t * freq;
    return acc + (cf * n * (n + 1)) / Math.pow(1 + y / freq, n + 2);
  }, 0);
  return sum / (price * freq * freq);
}

export interface BondRisk {
  price: number;
  ytm: YtmSolution;
  macaulay: number;
  modified: number;
  convexity: number;
  dv01: number; // price change per 1bp
}

export function analyzeBond(inst: BondInstrument, faceValue = 100): BondRisk {
  const flows = generateCashflows(inst, faceValue);
  const ytm = solveYtm(flows, inst.price, inst.freq, inst.couponRate || 0.04);
  const mac = macaulayDuration(flows, ytm.ytm, inst.freq);
  const mod = modifiedDuration(flows, ytm.ytm, inst.freq);
  const conv = convexity(flows, ytm.ytm, inst.freq);
  const dv01 = mod * inst.price * 0.0001;
  return { price: inst.price, ytm, macaulay: mac, modified: mod, convexity: conv, dv01 };
}

// ---------------------------------------------------------------------------
// Zero curve bootstrapping
// ---------------------------------------------------------------------------

export interface ZeroPoint {
  t: number;
  z: number; // continuously-compounded zero rate
  instrumentId: string;
}

/** Linear interpolation on a piecewise zero curve (continuously compounded). */
export function interpZero(curve: ZeroPoint[], t: number): number {
  if (curve.length === 0) return 0;
  if (t <= curve[0].t) return curve[0].z;
  if (t >= curve[curve.length - 1].t) return curve[curve.length - 1].z;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (t >= a.t && t <= b.t) {
      const w = (t - a.t) / (b.t - a.t);
      return a.z + w * (b.z - a.z);
    }
  }
  return curve[curve.length - 1].z;
}

export function discount(curve: ZeroPoint[], t: number): number {
  return Math.exp(-interpZero(curve, t) * t);
}

/**
 * Bootstrap a continuously-compounded zero curve from a set of coupon-bearing
 * instruments, sorted by maturity. For each instrument, all cashflows strictly
 * before its maturity are discounted using the curve built so far
 * (interpolated); the *final* cashflow's zero rate is then solved via
 * Newton-Raphson so that the discounted cashflows reproduce the market price.
 * This is the standard "bootstrapping" / curve-stripping algorithm.
 */
export function bootstrapZeroCurve(instruments: BondInstrument[]): ZeroPoint[] {
  const sorted = [...instruments].sort((a, b) => a.maturityYears - b.maturityYears);
  const curve: ZeroPoint[] = [];

  for (const inst of sorted) {
    const flows = generateCashflows(inst);
    const finalFlow = flows[flows.length - 1];
    const priorFlows = flows.slice(0, -1);

    const pvPrior = priorFlows.reduce((sum, { t, cf }) => sum + cf * discount(curve, t), 0);
    const residual = inst.price - pvPrior; // must equal finalFlow.cf * exp(-z*T)

    if (residual <= 0) continue; // malformed instrument, skip

    const T = finalFlow.t;
    const cf = finalFlow.cf;
    const f = (z: number) => cf * Math.exp(-z * T) - residual;
    const fp = (z: number) => -T * cf * Math.exp(-z * T);
    const { root } = newtonRaphson(f, fp, 0.04, { tol: 1e-10, maxIter: 60 });

    curve.push({ t: T, z: root, instrumentId: inst.id });
  }

  return curve.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Nelson-Siegel parametric fit (smooth par/zero curve for display + extrapolation)
// ---------------------------------------------------------------------------

export interface NelsonSiegelParams {
  beta0: number; // long-run level
  beta1: number; // short-term slope component
  beta2: number; // medium-term curvature component
  tau: number; // decay parameter
}

export function nelsonSiegelYield(p: NelsonSiegelParams, t: number): number {
  const x = t / p.tau;
  if (x < 1e-8) {
    return p.beta0 + p.beta1;
  }
  const decay = (1 - Math.exp(-x)) / x;
  return p.beta0 + p.beta1 * decay + p.beta2 * (decay - Math.exp(-x));
}

/** Fit Nelson-Siegel params to bootstrapped zero points by minimizing SSE via Nelder-Mead. */
export function fitNelsonSiegel(points: ZeroPoint[]): NelsonSiegelParams {
  const level = points.length ? points[points.length - 1].z : 0.04;
  const short = points.length ? points[0].z : 0.03;
  const x0 = [level, short - level, 0, 2];

  const objective = (x: number[]) => {
    const [beta0, beta1, beta2, tauRaw] = x;
    const tau = Math.max(0.05, Math.abs(tauRaw));
    const params: NelsonSiegelParams = { beta0, beta1, beta2, tau };
    return points.reduce((sse, pt) => {
      const err = nelsonSiegelYield(params, pt.t) - pt.z;
      return sse + err * err;
    }, 0);
  };

  const { x } = nelderMead(objective, x0, { maxIter: 4000, tol: 1e-14, step: 0.05 });
  const [beta0, beta1, beta2, tauRaw] = x;
  return { beta0, beta1, beta2, tau: Math.max(0.05, Math.abs(tauRaw)) };
}

export function nelsonSiegelCurve(params: NelsonSiegelParams, maxT = 30, n = 120) {
  return linspace(0.08, maxT, n).map((t) => ({ t, y: nelsonSiegelYield(params, t) }));
}
