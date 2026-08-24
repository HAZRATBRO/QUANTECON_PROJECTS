// Curated symbol universe, India-first. `symbol` is the Yahoo-Finance-style
// ticker used against the chart API (NSE names carry a .NS suffix, BSE .BO).
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY';

export interface EquitySymbol {
  symbol: string;
  name: string;
  exchange: string;
  currency: Currency;
  region: 'IN' | 'GLOBAL';
}

export const equitySymbols: EquitySymbol[] = [
  { symbol: '^NSEI', name: 'NIFTY 50', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: '^BSESN', name: 'SENSEX', exchange: 'BSE', currency: 'INR', region: 'IN' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'INFY.NS', name: 'Infosys', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'ITC.NS', name: 'ITC Limited', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'AXISBANK.NS', name: 'Axis Bank', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'MARUTI.NS', name: 'Maruti Suzuki', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', exchange: 'NSE', currency: 'INR', region: 'IN' },
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', currency: 'USD', region: 'GLOBAL' },
  { symbol: '^GSPC', name: 'S&P 500', exchange: 'NYSE', currency: 'USD', region: 'GLOBAL' },
];

export const currencySymbols: Record<Currency, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function findEquitySymbol(symbol: string): EquitySymbol {
  return equitySymbols.find((s) => s.symbol === symbol) ?? equitySymbols[0];
}

export interface FxPairDef {
  base: string;
  quote: string;
  label: string;
}

// India-first: INR crosses first, then major global pairs.
export const fxPairs: FxPairDef[] = [
  { base: 'USD', quote: 'INR', label: 'USD/INR' },
  { base: 'EUR', quote: 'INR', label: 'EUR/INR' },
  { base: 'GBP', quote: 'INR', label: 'GBP/INR' },
  { base: 'JPY', quote: 'INR', label: 'JPY/INR' },
  { base: 'EUR', quote: 'USD', label: 'EUR/USD' },
  { base: 'GBP', quote: 'USD', label: 'GBP/USD' },
  { base: 'USD', quote: 'JPY', label: 'USD/JPY' },
];

// Illustrative indicative policy/short rates per currency, used only for the
// domestic/foreign rate inputs to Garman-Kohlhagen — there's no free live
// source for these, so they're fixed approximations, clearly labeled as such
// in the UI.
export const indicativeRates: Record<string, number> = {
  INR: 0.065,
  USD: 0.045,
  EUR: 0.03,
  GBP: 0.045,
  JPY: 0.005,
};
