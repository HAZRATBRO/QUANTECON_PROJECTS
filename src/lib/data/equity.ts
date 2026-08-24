// Live equity/index quotes and daily history, sourced from Yahoo Finance's
// public chart endpoint (no key required). Any failure — CORS block, network
// error, rate limit, unexpected payload — falls back to a deterministic
// seeded synthetic series so the UI always has something sensible to render,
// clearly tagged with its actual source.
import { gaussian, mulberry32 } from '../rng';
import { fetchJson, hashSeed, type DataSource } from './http';
import type { EquitySymbol } from './symbols';

export interface EquitySeries {
  dates: string[];
  closes: number[];
  source: DataSource;
}

export interface EquityQuote {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
  currency: string;
  exchange: string;
  source: DataSource;
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { currency?: string; exchangeName?: string; regularMarketPrice?: number };
      timestamp: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }> | null;
  };
}

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

function syntheticEquitySeries(sym: EquitySymbol, days = 260): EquitySeries {
  const rand = mulberry32(hashSeed(sym.symbol));
  const basePrice = sym.currency === 'INR' ? 400 + rand() * 3200 : 40 + rand() * 400;
  const mu = 0.04 + rand() * 0.06;
  const sigma = 0.16 + rand() * 0.14;
  const dt = 1 / 252;
  let price = basePrice;
  const dates: string[] = [];
  const closes: number[] = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const z = gaussian(rand);
    price *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    dates.push(d.toISOString().slice(0, 10));
    closes.push(Math.round(price * 100) / 100);
  }
  return { dates, closes, source: 'sample' };
}

export async function fetchEquitySeries(sym: EquitySymbol, range: '6mo' | '1y' = '1y'): Promise<EquitySeries> {
  try {
    const url = `${YAHOO_CHART_URL}${encodeURIComponent(sym.symbol)}?range=${range}&interval=1d`;
    const json = await fetchJson<YahooChartResponse>(url, { timeoutMs: 7000 });
    const result = json.chart.result?.[0];
    if (!result) throw new Error('no chart result');
    const rawCloses = result.indicators.quote[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    const dates: string[] = [];
    const closes: number[] = [];
    rawCloses.forEach((c, i) => {
      if (c != null && timestamps[i] != null) {
        dates.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
        closes.push(c);
      }
    });
    if (closes.length < 20) throw new Error('insufficient live data points');
    return { dates, closes, source: 'live' };
  } catch {
    return syntheticEquitySeries(sym);
  }
}

export function quoteFromSeries(sym: EquitySymbol, series: EquitySeries): EquityQuote {
  const price = series.closes[series.closes.length - 1];
  const previousClose = series.closes[series.closes.length - 2] ?? price;
  return {
    symbol: sym.symbol,
    price,
    previousClose,
    changePct: previousClose ? (price - previousClose) / previousClose : 0,
    currency: sym.currency,
    exchange: sym.exchange,
    source: series.source,
  };
}
