// Builds a model-generated option chain + trade blotter for any underlying,
// keyed off a real (live-fetched, where available) spot price. A "true" vol
// surface generates theoretical mid prices, then bid/ask + a sample trade
// blotter are layered on top — mirroring how a real feed's implied vols are
// backed out from traded prices rather than hardcoded. This does not source
// an actual exchange option-chain feed (see the FX/options pages' explainer
// copy) — strikes, quotes and trades are synthetic, but *priced* through the
// same Black-Scholes machinery the rest of the app uses, off the real spot.
import { hashSeed } from '../data/http';
import { gaussian, mulberry32 } from '../rng';
import { bsPrice, type OptionType } from './options';

export interface Expiry {
  id: string;
  label: string;
  T: number; // years
}

export const standardExpiries: Expiry[] = [
  { id: 'e1m', label: '1M', T: 1 / 12 },
  { id: 'e2m', label: '2M', T: 2 / 12 },
  { id: 'e3m', label: '3M', T: 3 / 12 },
  { id: 'e6m', label: '6M', T: 6 / 12 },
  { id: 'e1y', label: '1Y', T: 1 },
];

/** Term-structure + skew + smile generating the "true" market. */
export function trueVol(k: number, T: number): number {
  const atm = 0.14 + 0.05 * Math.exp(-T / 0.25);
  const skew = -0.32;
  const curv = 0.85;
  return Math.max(atm + skew * k + curv * k * k, 0.04);
}

export interface ChainRow {
  id: string;
  expiryId: string;
  expiryLabel: string;
  T: number;
  strike: number;
  type: OptionType;
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  openInterest: number;
}

export interface Trade {
  id: string;
  time: string;
  expiryLabel: string;
  strike: number;
  type: OptionType;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  counterparty: string;
}

export interface OptionChainSet {
  riskFreeRate: number;
  dividendYield: number;
  expiries: Expiry[];
  chain: ChainRow[];
  trades: Trade[];
}

const desks = ['GS', 'MS', 'JPM', 'CITI', 'BARC', 'UBS', 'HSBC', 'DB', 'ICICI-SEC', 'KOTAK'];

function strikeStep(spot: number): number {
  if (spot >= 5000) return 50;
  if (spot >= 1000) return 10;
  if (spot >= 200) return 5;
  if (spot >= 20) return 1;
  return 0.5;
}

export function buildOptionChain(
  symbol: string,
  spot: number,
  riskFreeRate = 0.045,
  dividendYield = 0.015,
): OptionChainSet {
  const seed = hashSeed(symbol);
  const rand = mulberry32(seed);
  const strikeStepAbs = strikeStep(spot);
  const strikesPerSide = 6;
  const expiries = standardExpiries;

  const chain: ChainRow[] = [];
  for (const exp of expiries) {
    const forward = spot * Math.exp((riskFreeRate - dividendYield) * exp.T);
    for (let i = -strikesPerSide; i <= strikesPerSide; i++) {
      const strike = Math.round((spot * (1 + i * 0.025)) / strikeStepAbs) * strikeStepAbs;
      if (strike <= 0) continue;
      const k = Math.log(strike / forward);
      const vol = trueVol(k, exp.T);
      for (const type of ['call', 'put'] as const) {
        const theo = bsPrice({ S: spot, K: strike, T: exp.T, r: riskFreeRate, q: dividendYield, sigma: vol, type });
        const spreadPct = 0.02 + 0.05 * Math.min(Math.abs(i) / strikesPerSide, 1) + 0.01 * exp.T;
        const halfSpread = Math.max(theo * spreadPct, spot * 0.0005) / 2;
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

  const tradeRand = mulberry32(seed ^ 0x5b511);
  const liquidRows = chain.filter((r) => Math.abs(r.strike - spot) / spot < 0.1 && r.T <= 0.5);
  const trades: Trade[] = [];
  for (let i = 0; i < 40 && liquidRows.length > 0; i++) {
    const row = liquidRows[Math.floor(tradeRand() * liquidRows.length)];
    const side: Trade['side'] = tradeRand() > 0.5 ? 'BUY' : 'SELL';
    const atAsk = side === 'BUY';
    const px = atAsk
      ? row.ask - tradeRand() * (row.ask - row.mid) * 0.4
      : row.bid + tradeRand() * (row.mid - row.bid) * 0.4;
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

  return { riskFreeRate, dividendYield, expiries, chain, trades };
}
