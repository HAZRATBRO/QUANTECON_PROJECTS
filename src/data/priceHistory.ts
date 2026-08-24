// Synthetic daily close history (GBM) used to compute realized volatility.
// Seeded so it is stable across reloads.
import { gaussian, mulberry32 } from '../lib/rng';

export interface PricePoint {
  date: string;
  close: number;
}

function genSeries(seed: number, start: number, mu: number, sigma: number, days: number): PricePoint[] {
  const rand = mulberry32(seed);
  const dt = 1 / 252;
  let price = start;
  const out: PricePoint[] = [];
  const today = new Date('2026-08-24T00:00:00Z');
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const z = gaussian(rand);
    price *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    out.push({ date: d.toISOString().slice(0, 10), close: Math.round(price * 100) / 100 });
  }
  return out;
}

export const equityUnderlying = 'QEX';
export const equitySpotHistory: PricePoint[] = genSeries(4242, 4520, 0.06, 0.165, 260);
export const equitySpot = equitySpotHistory[equitySpotHistory.length - 1].close;

export const fxPair = 'EUR/USD';
export const fxSpotHistory: PricePoint[] = genSeries(7331, 1.0625, 0.01, 0.075, 260);
export const fxSpot = fxSpotHistory[fxSpotHistory.length - 1].close;
