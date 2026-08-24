// Illustrative Indian sovereign curve instruments (Treasury Bills + dated
// Government Securities). No free live sovereign-yield-curve API exists, so
// these are sample yields at plausible current levels, not fetched live —
// clearly labeled as such in the UI. Each instrument's price is generated
// from an assumed target yield so the Newton-Raphson YTM solver and the
// bootstrapper have internally-consistent inputs to recover — exactly the
// way a real curve-construction desk works backward from clean prices, not
// from yields directly. Indian G-Secs pay semi-annual coupons.
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

// A normal, upward-sloping curve typical of Indian G-Secs.
const seeds: Seed[] = [
  { id: 'tb91', label: '91D T-Bill', type: 'bill', maturityYears: 0.25, targetYield: 0.0638, couponRate: 0, freq: 2 },
  { id: 'tb182', label: '182D T-Bill', type: 'bill', maturityYears: 0.5, targetYield: 0.0645, couponRate: 0, freq: 2 },
  { id: 'tb364', label: '364D T-Bill', type: 'bill', maturityYears: 1, targetYield: 0.0652, couponRate: 0.065, freq: 2 },
  { id: 'gs2y', label: '2Y G-Sec', type: 'note', maturityYears: 2, targetYield: 0.0658, couponRate: 0.0655, freq: 2 },
  { id: 'gs5y', label: '5Y G-Sec', type: 'note', maturityYears: 5, targetYield: 0.0672, couponRate: 0.0665, freq: 2 },
  { id: 'gs7y', label: '7Y G-Sec', type: 'note', maturityYears: 7, targetYield: 0.068, couponRate: 0.0675, freq: 2 },
  { id: 'gs10y', label: '10Y G-Sec', type: 'note', maturityYears: 10, targetYield: 0.0692, couponRate: 0.0685, freq: 2 },
  { id: 'gs14y', label: '14Y G-Sec', type: 'bond', maturityYears: 14, targetYield: 0.0702, couponRate: 0.07, freq: 2 },
  { id: 'gs20y', label: '20Y G-Sec', type: 'bond', maturityYears: 20, targetYield: 0.0712, couponRate: 0.071, freq: 2 },
  { id: 'gs30y', label: '30Y G-Sec', type: 'bond', maturityYears: 30, targetYield: 0.0718, couponRate: 0.0715, freq: 2 },
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
  const noise = (rand() - 0.5) * 0.06; // +/- 3 paise of price noise for realism
  const price = priceFromYield(flows, s.targetYield, s.freq) + noise;
  return { ...partial, price: Math.round(price * 1000) / 1000 };
});

export const faceValue = 100;
