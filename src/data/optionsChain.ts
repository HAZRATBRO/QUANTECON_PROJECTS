// Synthetic but internally-consistent equity index option chain: a "true"
// vol surface generates theoretical mid prices, then bid/ask + a sample trade
// blotter (buy & sell side) are layered on top — mirroring how a real feed's
// implied vols are backed out from traded prices rather than hardcoded.
import { bsPrice } from '../lib/finance/options';
import { gaussian, mulberry32 } from '../lib/rng';
import { equitySpot } from './priceHistory';

export const riskFreeRate = 0.045;
export const dividendYield = 0.015;

export interface Expiry {
  id: string;
  label: string;
  T: number; // years
}

export const expiries: Expiry[] = [
  { id: 'e1m', label: '1M', T: 1 / 12 },
  { id: 'e2m', label: '2M', T: 2 / 12 },
  { id: 'e3m', label: '3M', T: 3 / 12 },
  { id: 'e6m', label: '6M', T: 6 / 12 },
  { id: 'e1y', label: '1Y', T: 1 },
];

// "True" vol surface generating the market: term structure + skew + smile.
export function trueVol(k: number, T: number): number {
  const atm = 0.14 + 0.05 * Math.exp(-T / 0.25);
  const skew = -0.32;
  const curv = 0.85;
  return Math.max(atm + skew * k + curv * k * k, 0.04);
}

const strikeStepPct = 0.025;
const strikesPerSide = 6;

export interface ChainRow {
  id: string;
  expiryId: string;
  expiryLabel: string;
  T: number;
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  openInterest: number;
}

const rand = mulberry32(90210);
export const chain: ChainRow[] = [];

for (const exp of expiries) {
  const forward = equitySpot * Math.exp((riskFreeRate - dividendYield) * exp.T);
  for (let i = -strikesPerSide; i <= strikesPerSide; i++) {
    const strike = Math.round((equitySpot * (1 + i * strikeStepPct)) / 5) * 5;
    const k = Math.log(strike / forward);
    const vol = trueVol(k, exp.T);
    for (const type of ['call', 'put'] as const) {
      const theo = bsPrice({ S: equitySpot, K: strike, T: exp.T, r: riskFreeRate, q: dividendYield, sigma: vol, type });
      const spreadPct = 0.02 + 0.05 * Math.min(Math.abs(i) / strikesPerSide, 1) + 0.01 * exp.T;
      const halfSpread = Math.max(theo * spreadPct, 0.05) / 2;
      const bid = Math.max(theo - halfSpread, 0.01);
      const ask = theo + halfSpread;
      chain.push({
        id: `${exp.id}-${strike}-${type}`,
        expiryId: exp.id,
        expiryLabel: exp.label,
        T: exp.T,
        strike,
        type,
        bid: Math.round(bid * 100) / 100,
        ask: Math.round(ask * 100) / 100,
        mid: Math.round(((bid + ask) / 2) * 100) / 100,
        volume: Math.round(50 + rand() * 4500 * Math.exp(-Math.abs(i) * 0.35)),
        openInterest: Math.round(200 + rand() * 20000 * Math.exp(-Math.abs(i) * 0.3)),
      });
    }
  }
}

export interface Trade {
  id: string;
  time: string;
  expiryLabel: string;
  strike: number;
  type: 'call' | 'put';
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  counterparty: string;
}

const desks = ['GS', 'MS', 'JPM', 'CITI', 'BARC', 'UBS', 'HSBC', 'DB'];
export const trades: Trade[] = [];
const tradeRand = mulberry32(55511);

// Sample a liquid subset of the chain (near-the-money, nearer expiries) for the blotter.
const liquidRows = chain.filter((r) => Math.abs(r.strike - equitySpot) / equitySpot < 0.1 && r.T <= 0.5);

for (let i = 0; i < 40; i++) {
  const row = liquidRows[Math.floor(tradeRand() * liquidRows.length)];
  const side: Trade['side'] = tradeRand() > 0.5 ? 'BUY' : 'SELL';
  const atAsk = side === 'BUY';
  const px = atAsk ? row.ask - tradeRand() * (row.ask - row.mid) * 0.4 : row.bid + tradeRand() * (row.mid - row.bid) * 0.4;
  const hour = 9 + Math.floor(tradeRand() * 7);
  const minute = Math.floor(tradeRand() * 60);
  trades.push({
    id: `t${i}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(Math.floor(tradeRand() * 60)).padStart(2, '0')}`,
    expiryLabel: row.expiryLabel,
    strike: row.strike,
    type: row.type,
    side,
    size: Math.max(1, Math.round(gaussian(tradeRand) * 15 + 20)),
    price: Math.round(Math.max(px, 0.01) * 100) / 100,
    counterparty: desks[Math.floor(tradeRand() * desks.length)],
  });
}
trades.sort((a, b) => (a.time < b.time ? 1 : -1));
