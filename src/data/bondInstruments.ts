// Sample sovereign curve instruments (illustrative, not live market data).
// Each instrument's price is generated from an assumed target yield so the
// Newton-Raphson YTM solver and the bootstrapper have internally-consistent
// inputs to recover — exactly the way a real curve-construction desk works
// backward from clean prices, not from yields directly.
import { generateCashflows, priceFromYield, type BondInstrument } from '../lib/finance/bonds';
import { mulberry32 } from '../lib/rng';

const rand = mulberry32(20260824);

interface Seed {
  id: string;
  label: string;
  type: BondInstrument['type'];
  maturityYears: number;
  targetYield: number;
  couponRate: number;
  freq: 1 | 2;
}

// A mildly humped/inverted-at-the-front curve, typical of a late-cycle regime.
const seeds: Seed[] = [
  { id: 'b3m', label: '3M Bill', type: 'bill', maturityYears: 0.25, targetYield: 0.0522, couponRate: 0, freq: 2 },
  { id: 'b6m', label: '6M Bill', type: 'bill', maturityYears: 0.5, targetYield: 0.0508, couponRate: 0, freq: 2 },
  { id: 'n1y', label: '1Y Note', type: 'note', maturityYears: 1, targetYield: 0.0475, couponRate: 0.045, freq: 2 },
  { id: 'n2y', label: '2Y Note', type: 'note', maturityYears: 2, targetYield: 0.0432, couponRate: 0.0425, freq: 2 },
  { id: 'n3y', label: '3Y Note', type: 'note', maturityYears: 3, targetYield: 0.0408, couponRate: 0.04, freq: 2 },
  { id: 'n5y', label: '5Y Note', type: 'note', maturityYears: 5, targetYield: 0.0392, couponRate: 0.0375, freq: 2 },
  { id: 'n7y', label: '7Y Note', type: 'note', maturityYears: 7, targetYield: 0.0398, couponRate: 0.0375, freq: 2 },
  { id: 'n10y', label: '10Y Note', type: 'note', maturityYears: 10, targetYield: 0.0415, couponRate: 0.04, freq: 2 },
  { id: 'b20y', label: '20Y Bond', type: 'bond', maturityYears: 20, targetYield: 0.0448, couponRate: 0.0425, freq: 2 },
  { id: 'b30y', label: '30Y Bond', type: 'bond', maturityYears: 30, targetYield: 0.0452, couponRate: 0.0425, freq: 2 },
];

export const bondInstruments: BondInstrument[] = seeds.map((s) => {
  const partial: BondInstrument = {
    id: s.id,
    label: s.label,
    type: s.type,
    maturityYears: s.maturityYears,
    couponRate: s.couponRate,
    price: 100,
    freq: s.freq,
  };
  const flows = generateCashflows(partial);
  const noise = (rand() - 0.5) * 0.06; // +/- 3 cents of price noise for realism
  const price = priceFromYield(flows, s.targetYield, s.freq) + noise;
  return { ...partial, price: Math.round(price * 1000) / 1000 };
});

export const faceValue = 100;
