// Live FX rates and daily history from Frankfurter (ECB reference rates,
// free, keyless, CORS-enabled for browser use). Falls back to a deterministic
// seeded synthetic series around a realistic anchor rate on any failure.
import { gaussian, mulberry32 } from '../rng';
import { fetchJson, hashSeed, type DataSource } from './http';

export interface FxSeries {
  dates: string[];
  rates: number[];
  source: DataSource;
}

interface FrankfurterTimeSeries {
  base: string;
  rates: Record<string, Record<string, number>>;
}

const FRANKFURTER_URL = 'https://api.frankfurter.app';

// Realistic-order-of-magnitude anchors so the sample fallback still looks
// plausible even when it isn't live.
const anchorRates: Record<string, number> = {
  'USD-INR': 87,
  'EUR-INR': 94,
  'GBP-INR': 110,
  'JPY-INR': 0.58,
  'EUR-USD': 1.08,
  'GBP-USD': 1.27,
  'USD-JPY': 150,
};

function syntheticFxSeries(base: string, quote: string, days = 220): FxSeries {
  const key = `${base}-${quote}`;
  const rand = mulberry32(hashSeed(key));
  const start = anchorRates[key] ?? 1 + rand() * 100;
  const mu = 0;
  const sigma = 0.06 + rand() * 0.06;
  const dt = 1 / 252;
  let rate = start;
  const dates: string[] = [];
  const rates: number[] = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const z = gaussian(rand);
    rate *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    dates.push(d.toISOString().slice(0, 10));
    rates.push(Math.round(rate * 10000) / 10000);
  }
  return { dates, rates, source: 'sample' };
}

export async function fetchFxSeries(base: string, quote: string, days = 180): Promise<FxSeries> {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url = `${FRANKFURTER_URL}/${fmt(start)}..${fmt(end)}?from=${base}&to=${quote}`;
    const json = await fetchJson<FrankfurterTimeSeries>(url, { timeoutMs: 7000 });
    const entries = Object.entries(json.rates).sort(([a], [b]) => a.localeCompare(b));
    const dates = entries.map(([d]) => d);
    const rates = entries.map(([, r]) => r[quote]);
    if (rates.length < 10 || rates.some((r) => r == null)) throw new Error('insufficient live data points');
    return { dates, rates, source: 'live' };
  } catch {
    return syntheticFxSeries(base, quote, days);
  }
}
