// Synthetic EUR/USD FX option chain (Garman-Kohlhagen), same construction
// approach as the equity chain: a "true" vol surface -> theoretical mid ->
// bid/ask -> sample trade blotter.
import { fxForward, gkPrice } from '../lib/finance/fx';
import { gaussian, mulberry32 } from '../lib/rng';
import { fxSpot } from './priceHistory';

export const domesticRate = 0.045; // USD
export const foreignRate = 0.03; // EUR

export interface FxExpiry {
  id: string;
  label: string;
  T: number;
}

export const fxExpiries: FxExpiry[] = [
  { id: 'w1', label: '1W', T: 7 / 365 },
  { id: 'm1', label: '1M', T: 1 / 12 },
  { id: 'm3', label: '3M', T: 3 / 12 },
  { id: 'm6', label: '6M', T: 6 / 12 },
  { id: 'y1', label: '1Y', T: 1 },
];

// FX smile: famously symmetric-ish "smile" (less skewed than equity) with a term structure.
export function trueFxVol(k: number, T: number): number {
  const atm = 0.07 + 0.03 * Math.exp(-T / 0.2);
  const skew = 0.05; // slight risk-reversal
  const curv = 0.55; // butterfly / smile curvature
  return Math.max(atm + skew * k + curv * k * k, 0.02);
}

const strikeStepPct = 0.01;
const strikesPerSide = 6;

export interface FxChainRow {
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

const rand = mulberry32(131317);
export const fxChain: FxChainRow[] = [];

for (const exp of fxExpiries) {
  const forward = fxForward(fxSpot, domesticRate, foreignRate, exp.T);
  for (let i = -strikesPerSide; i <= strikesPerSide; i++) {
    const strike = Math.round(fxSpot * (1 + i * strikeStepPct) * 10000) / 10000;
    const k = Math.log(strike / forward);
    const vol = trueFxVol(k, exp.T);
    for (const type of ['call', 'put'] as const) {
      const theo = gkPrice({ S: fxSpot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, sigma: vol, type });
      const spreadPct = 0.03 + 0.06 * Math.min(Math.abs(i) / strikesPerSide, 1) + 0.015 * exp.T;
      const halfSpread = Math.max(theo * spreadPct, 0.0002) / 2;
      const bid = Math.max(theo - halfSpread, 0.0001);
      const ask = theo + halfSpread;
      fxChain.push({
        id: `${exp.id}-${strike}-${type}`,
        expiryId: exp.id,
        expiryLabel: exp.label,
        T: exp.T,
        strike,
        type,
        bid: Math.round(bid * 10000) / 10000,
        ask: Math.round(ask * 10000) / 10000,
        mid: Math.round(((bid + ask) / 2) * 10000) / 10000,
        volume: Math.round(20 + rand() * 3000 * Math.exp(-Math.abs(i) * 0.35)),
        openInterest: Math.round(100 + rand() * 15000 * Math.exp(-Math.abs(i) * 0.3)),
      });
    }
  }
}

export interface FxTrade {
  id: string;
  time: string;
  expiryLabel: string;
  strike: number;
  type: 'call' | 'put';
  side: 'BUY' | 'SELL';
  size: number; // notional in EUR mm
  price: number;
  counterparty: string;
}

const banks = ['DB', 'UBS', 'BARC', 'HSBC', 'CITI', 'JPM', 'BNP', 'SG'];
export const fxTrades: FxTrade[] = [];
const tradeRand = mulberry32(24680);

const liquidRows = fxChain.filter((r) => Math.abs(r.strike - fxSpot) / fxSpot < 0.04 && r.T <= 0.25);

for (let i = 0; i < 40; i++) {
  const row = liquidRows[Math.floor(tradeRand() * liquidRows.length)];
  const side: FxTrade['side'] = tradeRand() > 0.5 ? 'BUY' : 'SELL';
  const atAsk = side === 'BUY';
  const px = atAsk
    ? row.ask - tradeRand() * (row.ask - row.mid) * 0.4
    : row.bid + tradeRand() * (row.mid - row.bid) * 0.4;
  const hour = 7 + Math.floor(tradeRand() * 10);
  const minute = Math.floor(tradeRand() * 60);
  fxTrades.push({
    id: `ft${i}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(Math.floor(tradeRand() * 60)).padStart(2, '0')}`,
    expiryLabel: row.expiryLabel,
    strike: row.strike,
    type: row.type,
    side,
    size: Math.max(1, Math.round(gaussian(tradeRand) * 8 + 10)),
    price: Math.round(Math.max(px, 0.0001) * 10000) / 10000,
    counterparty: banks[Math.floor(tradeRand() * banks.length)],
  });
}
fxTrades.sort((a, b) => (a.time < b.time ? 1 : -1));
