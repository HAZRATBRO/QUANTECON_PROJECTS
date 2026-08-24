import { useMemo, useState } from 'react';
import DarkPlot from '../components/DarkPlot';
import { useChartColors } from '../lib/chartColors';
import { Card, Field, inputClass, Pill, selectClass, Stat } from '../components/ui';
import { fetchEquitySeries, quoteFromSeries } from '../lib/data/equity';
import { equitySymbols, indicativeRates } from '../lib/data/symbols';
import { useAsyncData } from '../lib/data/useAsyncData';
import { formatMoney, pct } from '../lib/format';
import { bsGreeks, bsPrice, impliedVol, type OptionType } from '../lib/finance/options';
import { realizedVol, rollingRealizedVol } from '../lib/finance/vol';

const indiaSymbols = equitySymbols.filter((s) => s.region === 'IN');
const globalSymbols = equitySymbols.filter((s) => s.region === 'GLOBAL');

export default function EquityPage() {
  const colors = useChartColors();
  const [symbolTicker, setSymbolTicker] = useState(indiaSymbols[2].symbol); // RELIANCE.NS by default
  const sym = equitySymbols.find((s) => s.symbol === symbolTicker) ?? equitySymbols[0];

  const { data: series, loading } = useAsyncData(() => fetchEquitySeries(sym), [sym.symbol]);

  const quote = useMemo(() => (series ? quoteFromSeries(sym, series) : null), [series, sym]);
  const rv = useMemo(() => (series ? realizedVol(series.closes, 252) : 0), [series]);
  const rvSeries = useMemo(() => (series ? rollingRealizedVol(series.closes, 21) : []), [series]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-teal-400">Equity</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-50">Single-stock analytics</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          Live quote and price history, fetched directly from an open source in your browser — India's NSE/BSE names
          first, plus major global tickers. If a live fetch fails (network, rate limit, or browser CORS policy), a
          clearly-labeled sample series takes over so the page still works.
        </p>
      </div>

      <Card
        title="Pick a name"
        eyebrow="India-first universe"
        right={
          <select value={symbolTicker} onChange={(e) => setSymbolTicker(e.target.value)} className={selectClass}>
            <optgroup label="India (NSE / BSE)">
              {indiaSymbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.name} · {s.symbol}
                </option>
              ))}
            </optgroup>
            <optgroup label="Global">
              {globalSymbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.name} · {s.symbol}
                </option>
              ))}
            </optgroup>
          </select>
        }
      >
        {loading || !quote || !series ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading {sym.name}…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-ink-50">{sym.name}</h2>
              <span className="text-sm text-ink-400">
                {sym.symbol} &middot; {sym.exchange}
              </span>
              <Pill tone={quote.source === 'live' ? 'up' : 'warn'}>
                {quote.source === 'live' ? 'Live' : 'Sample data (live fetch unavailable)'}
              </Pill>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Last price" value={formatMoney(quote.price, sym.currency)} />
              <Stat
                label="Change"
                value={`${quote.changePct >= 0 ? '+' : ''}${pct(quote.changePct)}`}
                tone={quote.changePct >= 0 ? 'up' : 'down'}
              />
              <Stat label="Prev. close" value={formatMoney(quote.previousClose, sym.currency)} />
              <Stat label="Realized vol (1y, ann.)" value={pct(rv)} />
            </div>

            <div className="mt-5 h-72">
              <DarkPlot
                data={[
                  {
                    x: series.dates,
                    y: series.closes,
                    type: 'scatter',
                    mode: 'lines',
                    name: sym.symbol,
                    line: { color: colors.accent, width: 2 },
                    fill: 'tozeroy',
                    fillcolor: `${colors.accent}1f`,
                  },
                ]}
                layout={{ yaxis: { title: { text: `Price (${sym.currency})` } } }}
              />
            </div>

            <div className="mt-5 h-56">
              <DarkPlot
                data={[
                  {
                    x: rvSeries.map((p) => series.dates[p.index] ?? p.index),
                    y: rvSeries.map((p) => p.vol * 100),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Rolling 21d realized vol',
                    line: { color: colors.teal, width: 2 },
                  },
                ]}
                layout={{ yaxis: { title: { text: 'vol (%)' } } }}
              />
            </div>
          </>
        )}
      </Card>

      {quote && series && <SingleStockOptionCalc symbol={sym} spot={quote.price} realizedVolEstimate={rv} />}
    </div>
  );
}

const tenors = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

function SingleStockOptionCalc({
  symbol,
  spot,
  realizedVolEstimate,
}: {
  symbol: (typeof equitySymbols)[number];
  spot: number;
  realizedVolEstimate: number;
}) {
  const [strike, setStrike] = useState(() => Math.round(spot / 5) * 5);
  const [tenorDays, setTenorDays] = useState(90);
  const [type, setType] = useState<OptionType>('call');
  const [sigmaPct, setSigmaPct] = useState(() => Math.round(Math.max(realizedVolEstimate, 0.1) * 1000) / 10);
  const [marketPrice, setMarketPrice] = useState('');

  const r = indicativeRates[symbol.currency] ?? 0.05;
  const q = 0.01;
  const T = tenorDays / 365;
  const sigma = Math.max(sigmaPct / 100, 0.001);

  const price = bsPrice({ S: spot, K: strike, T, r, q, sigma, type });
  const greeks = bsGreeks({ S: spot, K: strike, T, r, q, sigma, type });

  const solvedIv = useMemo(() => {
    const mp = parseFloat(marketPrice);
    if (!mp || mp <= 0) return null;
    return impliedVol(mp, { S: spot, K: strike, T, r, q, type });
  }, [marketPrice, spot, strike, T, r, q, type]);

  return (
    <Card title={`${symbol.name} option pricer`} eyebrow="Black-Scholes, priced off the live spot above">
      <div className="grid gap-4 lg:grid-cols-[repeat(5,auto)_1fr] lg:items-end">
        <Field label="Strike">
          <input
            type="number"
            value={strike}
            onChange={(e) => setStrike(Number(e.target.value))}
            className={inputClass + ' w-28'}
          />
        </Field>
        <Field label="Tenor">
          <select value={tenorDays} onChange={(e) => setTenorDays(Number(e.target.value))} className={selectClass}>
            {tenors.map((t) => (
              <option key={t.days} value={t.days}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as OptionType)} className={selectClass}>
            <option value="call">Call</option>
            <option value="put">Put</option>
          </select>
        </Field>
        <Field label="Vol σ (%)">
          <input
            type="number"
            step="0.1"
            value={sigmaPct}
            onChange={(e) => setSigmaPct(Number(e.target.value))}
            className={inputClass + ' w-24'}
          />
        </Field>
        <Field label="Rate r (illustrative)">
          <span className="flex h-[34px] items-center text-sm font-mono text-ink-300">{pct(r)}</span>
        </Field>
        <Field label="Solve implied vol from a market price">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="e.g. market premium"
              value={marketPrice}
              onChange={(e) => setMarketPrice(e.target.value)}
              className={inputClass + ' w-40'}
            />
            {solvedIv && <Pill tone={solvedIv.converged ? 'up' : 'warn'}>IV {pct(solvedIv.iv)}</Pill>}
          </div>
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Theoretical price" value={formatMoney(price, symbol.currency)} />
        <Stat label="Delta" value={greeks.delta.toFixed(3)} />
        <Stat label="Gamma" value={greeks.gamma.toFixed(4)} />
        <Stat label="Vega / 1%" value={(greeks.vega / 100).toFixed(3)} />
        <Stat label="Theta / day" value={(greeks.theta / 365).toFixed(3)} />
        <Stat label="Rho" value={greeks.rho.toFixed(3)} />
      </div>
      <p className="mt-3 text-xs text-ink-500">
        r uses an illustrative indicative rate for {symbol.currency} (no free live source); q assumes a flat 1%
        dividend yield. Vol defaults to this stock's trailing realized vol — edit it, or enter a market price to
        back out implied vol instead.
      </p>
    </Card>
  );
}
