import { useMemo, useState } from 'react';
import DarkPlot from '../components/DarkPlot';
import { useChartColors } from '../lib/chartColors';
import { Card, Field, Katex, MathBlock, Pill, selectClass, Stat } from '../components/ui';
import { fetchEquitySeries, quoteFromSeries } from '../lib/data/equity';
import { equitySymbols, indicativeRates } from '../lib/data/symbols';
import { useAsyncData } from '../lib/data/useAsyncData';
import { formatMoney, pct } from '../lib/format';
import { buildOptionChain, type Expiry } from '../lib/finance/chainFactory';
import { bsGreeks, checkPutCallParity, impliedVol } from '../lib/finance/options';
import { buildVolSurface, fitQuadraticSmile, realizedVol, rollingRealizedVol, type SmileFit } from '../lib/finance/vol';

const dividendYield = 0.01; // flat illustrative assumption across names

const indiaSymbols = equitySymbols.filter((s) => s.region === 'IN');
const globalSymbols = equitySymbols.filter((s) => s.region === 'GLOBAL');

export default function OptionsPage() {
  const colors = useChartColors();
  const [symbolTicker, setSymbolTicker] = useState(equitySymbols[0].symbol); // NIFTY 50 by default
  const sym = equitySymbols.find((s) => s.symbol === symbolTicker) ?? equitySymbols[0];
  const riskFreeRate = indicativeRates[sym.currency] ?? 0.05;

  const { data: series, loading } = useAsyncData(() => fetchEquitySeries(sym), [sym.symbol]);
  const quote = useMemo(() => (series ? quoteFromSeries(sym, series) : null), [series, sym]);
  const spot = quote?.price ?? 0;

  const chainSet = useMemo(
    () => (spot > 0 ? buildOptionChain(sym.symbol, spot, riskFreeRate, dividendYield) : null),
    [sym.symbol, spot, riskFreeRate],
  );

  const [expiryId, setExpiryId] = useState<string | null>(null);
  const expiries: Expiry[] = chainSet?.expiries ?? [];
  const activeExpiryId = expiryId ?? expiries[1]?.id ?? expiries[0]?.id;
  const expiry = expiries.find((e) => e.id === activeExpiryId);

  const rowsForExpiry = useMemo(
    () => (chainSet ? chainSet.chain.filter((r) => r.expiryId === activeExpiryId) : []),
    [chainSet, activeExpiryId],
  );

  const rowsWithIv = useMemo(
    () =>
      expiry
        ? rowsForExpiry.map((r) => {
            const iv = impliedVol(r.mid, { S: spot, K: r.strike, T: r.T, r: riskFreeRate, q: dividendYield, type: r.type });
            return { ...r, iv };
          })
        : [],
    [rowsForExpiry, expiry, spot, riskFreeRate],
  );

  const strikes = useMemo(() => Array.from(new Set(rowsWithIv.map((r) => r.strike))).sort((a, b) => a - b), [rowsWithIv]);
  const byStrikeType = useMemo(() => {
    const m = new Map<string, (typeof rowsWithIv)[number]>();
    for (const r of rowsWithIv) m.set(`${r.strike}-${r.type}`, r);
    return m;
  }, [rowsWithIv]);

  const [parityStrike, setParityStrike] = useState<number | null>(null);
  const activeParityStrike = parityStrike ?? strikes[Math.floor(strikes.length / 2)];
  const call = byStrikeType.get(`${activeParityStrike}-call`);
  const put = byStrikeType.get(`${activeParityStrike}-put`);
  const parity = useMemo(() => {
    if (!call || !put || !expiry) return null;
    return checkPutCallParity(call.mid, put.mid, spot, activeParityStrike, riskFreeRate, dividendYield, expiry.T);
  }, [call, put, activeParityStrike, expiry, spot, riskFreeRate]);

  const rv = useMemo(() => (series ? realizedVol(series.closes, 252) : 0), [series]);
  const rvSeries = useMemo(() => (series ? rollingRealizedVol(series.closes, 21) : []), [series]);

  const atmIvByExpiry = useMemo(() => {
    if (!chainSet) return [];
    return chainSet.expiries.map((e) => {
      const rows = chainSet.chain.filter((r) => r.expiryId === e.id);
      const atmStrike = rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), rows[0]);
      const callRow = rows.find((r) => r.strike === atmStrike.strike && r.type === 'call')!;
      const iv = impliedVol(callRow.mid, { S: spot, K: callRow.strike, T: e.T, r: riskFreeRate, q: dividendYield, type: 'call' });
      return { label: e.label, T: e.T, iv: iv.iv };
    });
  }, [chainSet, spot, riskFreeRate]);

  const smiles = useMemo<SmileFit[]>(() => {
    if (!chainSet) return [];
    return chainSet.expiries.map((e) => {
      const rows = chainSet.chain.filter((r) => r.expiryId === e.id);
      const forward = spot * Math.exp((riskFreeRate - dividendYield) * e.T);
      const pts = rows
        .filter((r) => r.type === (r.strike >= forward ? 'call' : 'put'))
        .map((r) => {
          const iv = impliedVol(r.mid, { S: spot, K: r.strike, T: e.T, r: riskFreeRate, q: dividendYield, type: r.type });
          return { k: Math.log(r.strike / forward), iv: iv.iv };
        });
      return fitQuadraticSmile(e.T, pts);
    });
  }, [chainSet, spot, riskFreeRate]);

  const surface = useMemo(() => buildVolSurface(smiles), [smiles]);

  if (loading || !chainSet || !quote || !expiry) {
    return (
      <div className="space-y-6">
        <PageHeader sym={sym} symbolTicker={symbolTicker} setSymbolTicker={setSymbolTicker} />
        <div className="py-16 text-center text-sm text-ink-400">Loading {sym.name} option chain…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader sym={sym} symbolTicker={symbolTicker} setSymbolTicker={setSymbolTicker} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Pill tone={quote.source === 'live' ? 'up' : 'warn'}>
          {quote.source === 'live' ? 'Live spot' : 'Sample spot (live fetch unavailable)'}
        </Pill>
        <span className="text-ink-300">
          Spot <span className="font-mono text-ink-100">{formatMoney(spot, sym.currency)}</span> &middot; r{' '}
          <span className="font-mono text-ink-100">{pct(riskFreeRate)}</span> &middot; q{' '}
          <span className="font-mono text-ink-100">{pct(dividendYield)}</span>
        </span>
      </div>

      <Card
        title="Option chain"
        eyebrow="Model-priced off the live spot above"
        right={
          <select value={activeExpiryId} onChange={(e) => setExpiryId(e.target.value)} className={selectClass}>
            {expiries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} expiry
              </option>
            ))}
          </select>
        }
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-700/60 text-center text-[11px] uppercase tracking-wide text-ink-400">
                <th colSpan={4} className="py-2 text-teal-400">
                  Calls
                </th>
                <th className="py-2">Strike</th>
                <th colSpan={4} className="py-2 text-rose-400">
                  Puts
                </th>
              </tr>
              <tr className="border-b border-ink-700/60 text-center text-[11px] uppercase tracking-wide text-ink-500">
                <th className="py-1.5 font-medium">IV</th>
                <th className="py-1.5 font-medium">Bid</th>
                <th className="py-1.5 font-medium">Ask</th>
                <th className="py-1.5 font-medium">OI</th>
                <th className="py-1.5 font-medium text-ink-300">·</th>
                <th className="py-1.5 font-medium">Bid</th>
                <th className="py-1.5 font-medium">Ask</th>
                <th className="py-1.5 font-medium">IV</th>
                <th className="py-1.5 font-medium">OI</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map((k) => {
                const c = byStrikeType.get(`${k}-call`);
                const p = byStrikeType.get(`${k}-put`);
                const atm = Math.abs(k - spot) / spot < 0.01;
                return (
                  <tr key={k} className={`border-b border-ink-800/50 text-center font-mono ${atm ? 'bg-accent-500/5' : ''}`}>
                    <td className="py-1.5 text-teal-300">{c ? pct(c.iv.iv) : '—'}</td>
                    <td className="py-1.5 text-ink-300">{c?.bid.toFixed(2)}</td>
                    <td className="py-1.5 text-ink-100">{c?.ask.toFixed(2)}</td>
                    <td className="py-1.5 text-ink-500">{c?.openInterest.toLocaleString()}</td>
                    <td className="py-1.5 font-sans font-semibold text-ink-100">{k}</td>
                    <td className="py-1.5 text-ink-300">{p?.bid.toFixed(2)}</td>
                    <td className="py-1.5 text-ink-100">{p?.ask.toFixed(2)}</td>
                    <td className="py-1.5 text-rose-300">{p ? pct(p.iv.iv) : '—'}</td>
                    <td className="py-1.5 text-ink-500">{p?.openInterest.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">Prices in {sym.currency}.</p>
      </Card>

      <Card title="Trade blotter" eyebrow="Buy &amp; sell side" right={<Pill>{chainSet.trades.length} trades</Pill>}>
        <div className="scroll-thin max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 bg-ink-900">
              <tr className="border-b border-ink-700/60 text-[11px] uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Expiry</th>
                <th className="py-2 pr-4 font-medium">Strike</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Side</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">Counterparty</th>
              </tr>
            </thead>
            <tbody>
              {chainSet.trades.map((t) => (
                <tr key={t.id} className="border-b border-ink-800/50 font-mono">
                  <td className="py-1.5 pr-4 text-ink-400">{t.time}</td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.expiryLabel}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{t.strike}</td>
                  <td className="py-1.5 pr-4 capitalize text-ink-300">{t.type}</td>
                  <td className="py-1.5 pr-4">
                    <Pill tone={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</Pill>
                  </td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.size}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{t.price.toFixed(2)}</td>
                  <td className="py-1.5 pr-4 text-ink-400">{t.counterparty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Put-call parity" eyebrow="Verified against traded mid quotes">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p>For European options on a dividend-paying underlier, no-arbitrage requires:</p>
            <MathBlock>{'C - P = S\\,e^{-qT} - K\\,e^{-rT}'}</MathBlock>
            <p>
              Plugging in this expiry's actual traded mid prices for a matched call/put strike checks whether the
              live market is consistent with that identity, within a small tolerance for bid/ask noise.
            </p>
            <Field label="Strike">
              <select value={activeParityStrike} onChange={(e) => setParityStrike(Number(e.target.value))} className={selectClass}>
                {strikes.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {parity && (
            <div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Call mid" value={parity.call.toFixed(2)} />
                <Stat label="Put mid" value={parity.put.toFixed(2)} />
                <Stat label="C − P" value={parity.lhs.toFixed(3)} />
                <Stat label="Se⁻ᵠᵀ − Ke⁻ʳᵀ" value={parity.rhs.toFixed(3)} />
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-850/60 px-4 py-3">
                <Pill tone={parity.holds ? 'up' : 'warn'}>{parity.holds ? 'Parity holds' : 'Deviation flagged'}</Pill>
                <span className="font-mono text-sm text-ink-300">
                  diff {parity.diff.toFixed(3)} ({parity.diffBps.toFixed(1)} bps of spot)
                </span>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                Small deviations are expected from the bid/ask spread; a large, persistent break would signal an
                arbitrage or a stale/erroneous quote.
              </p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Implied vs. realized volatility" eyebrow={`${sym.symbol} · ATM term structure`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: atmIvByExpiry.map((e) => e.label),
                  y: atmIvByExpiry.map((e) => e.iv * 100),
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: 'ATM implied vol',
                  line: { color: colors.accent, width: 3 },
                  marker: { size: 7 },
                },
                {
                  x: atmIvByExpiry.map((e) => e.label),
                  y: atmIvByExpiry.map(() => rv * 100),
                  type: 'scatter',
                  mode: 'lines',
                  name: '21d realized vol (flat ref.)',
                  line: { color: colors.teal, width: 2, dash: 'dash' },
                },
              ]}
              layout={{ yaxis: { title: { text: 'vol (%)' } }, legend: { orientation: 'h', y: -0.2 } }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Realized vol (1y, ann.)" value={pct(rv)} />
            <Stat
              label="ATM IV − RV spread"
              value={pct((atmIvByExpiry[1]?.iv ?? 0) - rv)}
              tone={(atmIvByExpiry[1]?.iv ?? 0) - rv >= 0 ? 'up' : 'down'}
            />
          </div>
        </Card>

        <Card title="Rolling 21d realized volatility" eyebrow={`${sym.symbol} spot history`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: rvSeries.map((p) => series?.dates[p.index] ?? p.index),
                  y: rvSeries.map((p) => p.vol * 100),
                  type: 'scatter',
                  mode: 'lines',
                  fill: 'tozeroy',
                  fillcolor: `${colors.accent2}1f`,
                  line: { color: colors.accent2, width: 2 },
                  name: 'Realized vol',
                },
              ]}
              layout={{ yaxis: { title: { text: 'vol (%)' } } }}
            />
          </div>
        </Card>
      </div>

      <Card title="Implied volatility surface" eyebrow="Quadratic smile fit → variance interpolation">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="h-[420px]">
            <DarkPlot
              data={[
                {
                  type: 'surface',
                  x: surface.moneyness,
                  y: surface.tenors,
                  z: surface.iv.map((row) => row.map((v) => v * 100)),
                  colorscale: [
                    [0, colors.teal],
                    [0.5, colors.accent],
                    [1, colors.rose],
                  ],
                  showscale: false,
                  contours: { z: { show: true, usecolormap: true, project: { z: true } } },
                } as never,
              ]}
              layout={{
                margin: { l: 0, r: 0, t: 10, b: 0 },
                scene: {
                  xaxis: { title: { text: 'log-moneyness k' }, gridcolor: colors.grid },
                  yaxis: { title: { text: 'tenor (y)' }, gridcolor: colors.grid },
                  zaxis: { title: { text: 'IV (%)' }, gridcolor: colors.grid },
                  bgcolor: 'transparent',
                },
              }}
            />
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p className="font-medium text-ink-100">How the surface is built</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                For each traded expiry, invert every strike's mid price to implied vol via Newton-Raphson (fallback
                bisection), giving discrete smile points in log-moneyness <Katex>{'k=\\ln(K/F)'}</Katex>.
              </li>
              <li>
                Fit a quadratic <Katex>{'\\sigma(k)=a+bk+ck^2'}</Katex> per expiry by closed-form least squares — the
                three coefficients are solved from the normal equations directly (no iteration needed).
              </li>
              <li>
                Convert each fitted smile to <span className="font-medium text-ink-100">total variance</span>{' '}
                <Katex>{'w(k,T)=\\sigma(k,T)^2 T'}</Katex> on a shared moneyness grid, then interpolate w linearly
                across tenors at each grid point.
              </li>
              <li>
                Convert back: <Katex>{'\\sigma(k,T)=\\sqrt{w(k,T)/T}'}</Katex>. Interpolating in total variance
                (rather than vol directly) is standard practice — it keeps the calendar spread of variance
                well-behaved between expiries.
              </li>
            </ol>
            <p className="text-xs text-ink-500">
              The strikes, quotes and blotter here are model-generated off the live spot above (not sourced from an
              exchange option-chain feed) — see the overview page for why.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Risk of a single contract" eyebrow="Black-Scholes greeks">
        <GreeksExplorer sym={sym} spot={spot} riskFreeRate={riskFreeRate} chainSet={chainSet} />
      </Card>
    </div>
  );
}

function PageHeader({
  sym,
  symbolTicker,
  setSymbolTicker,
}: {
  sym: (typeof equitySymbols)[number];
  symbolTicker: string;
  setSymbolTicker: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-teal-400">Equity Options</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-50">{sym.name} option chain, parity &amp; volatility surface</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          Pick any underlying below — the spot is fetched live where possible; the chain itself is priced through
          real Black-Scholes math off that spot, not sourced from an exchange feed.
        </p>
      </div>
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
    </div>
  );
}

function GreeksExplorer({
  sym,
  spot,
  riskFreeRate,
  chainSet,
}: {
  sym: (typeof equitySymbols)[number];
  spot: number;
  riskFreeRate: number;
  chainSet: NonNullable<ReturnType<typeof buildOptionChain>>;
}) {
  const [expId, setExpId] = useState(chainSet.expiries[1]?.id ?? chainSet.expiries[0].id);
  const exp = chainSet.expiries.find((e) => e.id === expId) ?? chainSet.expiries[0];
  const strikesForExp = Array.from(new Set(chainSet.chain.filter((r) => r.expiryId === expId).map((r) => r.strike))).sort(
    (a, b) => a - b,
  );
  const atmStrike = strikesForExp.reduce((best, k) => (Math.abs(k - spot) < Math.abs(best - spot) ? k : best), strikesForExp[0]);
  const [strike, setStrike] = useState(atmStrike);
  const [type, setType] = useState<'call' | 'put'>('call');
  const row = chainSet.chain.find((r) => r.expiryId === expId && r.strike === strike && r.type === type);

  const iv = row ? impliedVol(row.mid, { S: spot, K: strike, T: exp.T, r: riskFreeRate, q: dividendYield, type }) : null;

  const greeks = useMemo(() => {
    if (!iv) return null;
    return bsGreeks({ S: spot, K: strike, T: exp.T, r: riskFreeRate, q: dividendYield, sigma: iv.iv, type });
  }, [iv, spot, strike, exp.T, riskFreeRate, type]);

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_auto_auto_1fr] lg:items-end">
      <Field label="Expiry">
        <select value={expId} onChange={(e) => setExpId(e.target.value)} className={selectClass}>
          {chainSet.expiries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Strike">
        <select value={strike} onChange={(e) => setStrike(Number(e.target.value))} className={selectClass}>
          {strikesForExp.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value as 'call' | 'put')} className={selectClass}>
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
      </Field>
      {greeks && row && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Stat label="Mid" value={formatMoney(row.mid, sym.currency)} />
          <Stat label="IV" value={pct(iv!.iv)} />
          <Stat label="Delta" value={greeks.delta.toFixed(3)} />
          <Stat label="Gamma" value={greeks.gamma.toFixed(4)} />
          <Stat label="Vega/1%" value={(greeks.vega / 100).toFixed(3)} />
          <Stat label="Theta/day" value={(greeks.theta / 365).toFixed(3)} />
        </div>
      )}
    </div>
  );
}
