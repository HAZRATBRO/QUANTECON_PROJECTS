// Builds a model-generated FX option chain + trade blotter for any currency
// pair, keyed off a real (live-fetched, where available) spot rate. Same
// construction approach as chainFactory.ts (see that file's header) but
// priced through Garman-Kohlhagen with two rate curves.
import { hashSeed } from '../data/http';
import { gaussian, mulberry32 } from '../rng';
import { fxForward, gkPrice } from './fx';
import type { OptionType } from './options';

export interface FxExpiry {
  id: string;
  label: string;
  T: number;
}

export const standardFxExpiries: FxExpiry[] = [
  { id: 'w1', label: '1W', T: 7 / 365 },
  { id: 'm1', label: '1M', T: 1 / 12 },
  { id: 'm3', label: '3M', T: 3 / 12 },
  { id: 'm6', label: '6M', T: 6 / 12 },
  { id: 'y1', label: '1Y', T: 1 },
];

/** FX smile: famously symmetric-ish (less skewed than equity) with a term structure. */
export function trueFxVol(k: number, T: number): number {
  const atm = 0.06 + 0.03 * Math.exp(-T / 0.2);
  const skew = 0.05; // slight risk-reversal
  const curv = 0.55; // butterfly / smile curvature
  return Math.max(atm + skew * k + curv * k * k, 0.02);
}

export interface FxChainRow {
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

export interface FxTrade {
  id: string;
  time: string;
  expiryLabel: string;
  strike: number;
  type: OptionType;
  side: 'BUY' | 'SELL';
  size: number; // notional, in millions of the base currency
  price: number;
  counterparty: string;
}

export interface FxChainSet {
  domesticRate: number;
  foreignRate: number;
  pipDecimals: number;
  expiries: FxExpiry[];
  chain: FxChainRow[];
  trades: FxTrade[];
}

const banks = ['DB', 'UBS', 'BARC', 'HSBC', 'CITI', 'JPM', 'BNP', 'SG', 'ICICI', 'HDFC-B'];

function pipDecimalsFor(quote: string): number {
  return quote === 'JPY' ? 2 : 4;
}

export function buildFxOptionChain(
  base: string,
  quote: string,
  spot: number,
  domesticRate: number,
  foreignRate: number,
): FxChainSet {
  const seed = hashSeed(`${base}${quote}`);
  const rand = mulberry32(seed);
  const pipDecimals = pipDecimalsFor(quote);
  const pipRound = Math.pow(10, pipDecimals);
  const strikesPerSide = 6;
  const expiries = standardFxExpiries;

  const chain: FxChainRow[] = [];
  for (const exp of expiries) {
    const forward = fxForward(spot, domesticRate, foreignRate, exp.T);
    for (let i = -strikesPerSide; i <= strikesPerSide; i++) {
      const strike = Math.round(spot * (1 + i * 0.01) * pipRound) / pipRound;
      const k = Math.log(strike / forward);
      const vol = trueFxVol(k, exp.T);
      for (const type of ['call', 'put'] as const) {
        const theo = gkPrice({ S: spot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, sigma: vol, type });
        const spreadPct = 0.03 + 0.06 * Math.min(Math.abs(i) / strikesPerSide, 1) + 0.015 * exp.T;
        const halfSpread = Math.max(theo * spreadPct, spot * 0.00003) / 2;
        const bid = Math.max(theo - halfSpread, spot * 0.00001);
        const ask = theo + halfSpread;
        chain.push({
          id: `${exp.id}-${strike}-${type}`,
          expiryId: exp.id,
          expiryLabel: exp.label,
          T: exp.T,
          strike,
          type,
          bid: Math.round(bid * pipRound) / pipRound,
          ask: Math.round(ask * pipRound) / pipRound,
          mid: Math.round(((bid + ask) / 2) * pipRound) / pipRound,
          volume: Math.round(20 + rand() * 3000 * Math.exp(-Math.abs(i) * 0.35)),
          openInterest: Math.round(100 + rand() * 15000 * Math.exp(-Math.abs(i) * 0.3)),
        });
      }
    }
  }

  const tradeRand = mulberry32(seed ^ 0x60a8);
  const liquidRows = chain.filter((r) => Math.abs(r.strike - spot) / spot < 0.04 && r.T <= 0.25);
  const trades: FxTrade[] = [];
  for (let i = 0; i < 40 && liquidRows.length > 0; i++) {
    const row = liquidRows[Math.floor(tradeRand() * liquidRows.length)];
    const side: FxTrade['side'] = tradeRand() > 0.5 ? 'BUY' : 'SELL';
    const atAsk = side === 'BUY';
    const px = atAsk
      ? row.ask - tradeRand() * (row.ask - row.mid) * 0.4
      : row.bid + tradeRand() * (row.mid - row.bid) * 0.4;
    const hour = 7 + Math.floor(tradeRand() * 10);
    const minute = Math.floor(tradeRand() * 60);
    trades.push({
      id: `ft${i}`,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(Math.floor(tradeRand() * 60)).padStart(2, '0')}`,
      expiryLabel: row.expiryLabel,
      strike: row.strike,
      type: row.type,
      side,
      size: Math.max(1, Math.round(gaussian(tradeRand) * 8 + 10)),
      price: Math.round(Math.max(px, spot * 0.00001) * pipRound) / pipRound,
      counterparty: banks[Math.floor(tradeRand() * banks.length)],
    });
  }
  trades.sort((a, b) => (a.time < b.time ? 1 : -1));

  return { domesticRate, foreignRate, pipDecimals, expiries, chain, trades };
}
