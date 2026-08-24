import { currencySymbols, type Currency } from './data/symbols';

export function formatMoney(value: number, currency: Currency, maximumFractionDigits = 2): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${currencySymbols[currency]}${value.toLocaleString(locale, { maximumFractionDigits, minimumFractionDigits: 2 })}`;
}

export function pct(x: number, dp = 2): string {
  return `${(x * 100).toFixed(dp)}%`;
}
