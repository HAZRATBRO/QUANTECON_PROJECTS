import { useMemo, useState } from 'react';
import DarkPlot from '../components/DarkPlot';
import { useChartColors } from '../lib/chartColors';
import { Card, Field, Katex, MathBlock, Pill, selectClass, Stat } from '../components/ui';
import { fetchFxSeries } from '../lib/data/fx';
import { fxPairs, indicativeRates, type FxPairDef } from '../lib/data/symbols';
import { useAsyncData } from '../lib/data/useAsyncData';
import { pct } from '../lib/format';
import { buildFxOptionChain, type FxExpiry } from '../lib/finance/fxChainFactory';
import { checkFxPutCallParity, forwardDelta, fxForward, fxImpliedVol, gkGreeks } from '../lib/finance/fx';
import { buildVolSurface, fitQuadraticSmile, realizedVol, rollingRealizedVol, type SmileFit } from '../lib/finance/vol';

function pipsFmt(x: number, decimals: number) {
  const pipFactor = decimals === 2 ? 100 : 10000;
  return (x * pipFactor).toFixed(1);
}

export default function FxPage() {
  const colors = useChartColors();
  const [pairKey, setPairKey] = useState(`${fxPairs[0].base}${fxPairs[0].quote}`); // USD/INR by default
  const pair = fxPairs.find((p) => `${p.base}${p.quote}` === pairKey) ?? fxPairs[0];
  const domesticRate = indicativeRates[pair.quote] ?? 0.05;
  const foreignRate = indicativeRates[pair.base] ?? 0.03;

  const { data: series, loading } = useAsyncData(() => fetchFxSeries(pair.base, pair.quote), [pair.base, pair.quote]);
  const spot = series?.rates[series.rates.length - 1] ?? 0;

  const chainSet = useMemo(
    () => (spot > 0 ? buildFxOptionChain(pair.base, pair.quote, spot, domesticRate, foreignRate) : null),
    [pair.base, pair.quote, spot, domesticRate, foreignRate],
  );

  const [expiryId, setExpiryId] = useState<string | null>(null);
  const expiries: FxExpiry[] = chainSet?.expiries ?? [];
  const activeExpiryId = expiryId ?? expiries[2]?.id ?? expiries[0]?.id;
  const expiry = expiries.find((e) => e.id === activeExpiryId);
  const forward = expiry ? fxForward(spot, domesticRate, foreignRate, expiry.T) : 0;

  const rowsForExpiry = useMemo(
    () => (chainSet ? chainSet.chain.filter((r) => r.expiryId === activeExpiryId) : []),
    [chainSet, activeExpiryId],
  );

  const rowsWithIv = useMemo(
    () =>
      expiry
        ? rowsForExpiry.map((r) => {
            const iv = fxImpliedVol(r.mid, { S: spot, K: r.strike, T: r.T, rd: domesticRate, rf: foreignRate, type: r.type });
            const delta = forwardDelta({ S: spot, K: r.strike, T: r.T, rd: domesticRate, rf: foreignRate, sigma: iv.iv, type: r.type });
            return { ...r, iv, delta };
          })
        : [],
    [rowsForExpiry, expiry, spot, domesticRate, foreignRate],
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
    return checkFxPutCallParity(call.mid, put.mid, spot, activeParityStrike, domesticRate, foreignRate, expiry.T);
  }, [call, put, activeParityStrike, expiry, spot, domesticRate, foreignRate]);

  const rv = useMemo(() => (series ? realizedVol(series.rates, 252) : 0), [series]);
  const rvSeries = useMemo(() => (series ? rollingRealizedVol(series.rates, 21) : []), [series]);

  const atmIvByExpiry = useMemo(() => {
    if (!chainSet) return [];
    return chainSet.expiries.map((e) => {
      const f = fxForward(spot, domesticRate, foreignRate, e.T);
      const rows = chainSet.chain.filter((r) => r.expiryId === e.id);
      const atmStrike = rows.reduce((best, r) => (Math.abs(r.strike - f) < Math.abs(best.strike - f) ? r : best), rows[0]);
      const callRow = rows.find((r) => r.strike === atmStrike.strike && r.type === 'call')!;
      const iv = fxImpliedVol(callRow.mid, { S: spot, K: callRow.strike, T: e.T, rd: domesticRate, rf: foreignRate, type: 'call' });
      return { label: e.label, T: e.T, iv: iv.iv };
    });
  }, [chainSet, spot, domesticRate, foreignRate]);

  const smiles = useMemo<SmileFit[]>(() => {
    if (!chainSet) return [];
    return chainSet.expiries.map((e) => {
      const f = fxForward(spot, domesticRate, foreignRate, e.T);
      const rows = chainSet.chain.filter((r) => r.expiryId === e.id);
      const pts = rows
        .filter((r) => r.type === (r.strike >= f ? 'call' : 'put'))
        .map((r) => {
          const iv = fxImpliedVol(r.mid, { S: spot, K: r.strike, T: e.T, rd: domesticRate, rf: foreignRate, type: r.type });
          return { k: Math.log(r.strike / f), iv: iv.iv };
        });
      return fitQuadraticSmile(e.T, pts);
    });
  }, [chainSet, spot, domesticRate, foreignRate]);

  const surface = useMemo(() => buildVolSurface(smiles, [-0.15, 0.15]), [smiles]);
  const pipDecimals = chainSet?.pipDecimals ?? 4;

  if (loading || !chainSet || !expiry) {
    return (
      <div className="space-y-6">
        <PageHeader pair={pair} pairKey={pairKey} setPairKey={setPairKey} />
        <div className="py-16 text-center text-sm text-ink-400">Loading {pair.label}…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader pair={pair} pairKey={pairKey} setPairKey={setPairKey} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Pill tone={series?.source === 'live' ? 'up' : 'warn'}>
          {series?.source === 'live' ? 'Live spot' : 'Sample spot (live fetch unavailable)'}
        </Pill>
        <span className="text-ink-300">
          Spot <span className="font-mono text-ink-100">{spot.toFixed(4)}</span> &middot; r_d ({pair.quote}){' '}
          <span className="font-mono text-ink-100">{pct(domesticRate)}</span> &middot; r_f ({pair.base}){' '}
          <span className="font-mono text-ink-100">{pct(foreignRate)}</span> &middot; {expiry.label} forward{' '}
          <span className="font-mono text-ink-100">{forward.toFixed(4)}</span>
        </span>
      </div>

      <Card title="Garman-Kohlhagen pricing" eyebrow="Theory — FX is Black-Scholes with two curves">
        <div className="grid gap-6 lg:grid-cols-2 text-sm leading-relaxed text-ink-300">
          <div className="space-y-3">
            <p>
              An FX option's underlying carries a "yield" too: the foreign risk-free rate <Katex>{'r_f'}</Katex>,
              playing the same role a dividend yield plays for equities. The price is Black-Scholes with{' '}
              <Katex>{'q \\to r_f'}</Katex> and <Katex>{'r \\to r_d'}</Katex>:
            </p>
            <MathBlock>{'C = S\\,e^{-r_f T}N(d_1) - K\\,e^{-r_d T}N(d_2)'}</MathBlock>
            <MathBlock>{'d_1 = \\dfrac{\\ln(S/K) + (r_d - r_f + \\sigma^2/2)T}{\\sigma\\sqrt{T}}, \\quad d_2 = d_1 - \\sigma\\sqrt{T}'}</MathBlock>
          </div>
          <div className="space-y-3">
            <p>
              The FX market quotes strikes by <span className="font-medium text-ink-100">forward delta</span> rather
              than absolute levels, and prices relative to the forward <Katex>{'F = S\\,e^{(r_d-r_f)T}'}</Katex>:
            </p>
            <MathBlock>{'\\Delta_{fwd} = N(d_1),\\qquad d_1 = \\dfrac{\\ln(F/K) + \\sigma^2 T/2}{\\sigma\\sqrt{T}}'}</MathBlock>
            <p>
              r_d/r_f above are illustrative indicative rates (no free live source exists for these) — the spot
              itself is fetched live where available.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Option chain"
        eyebrow="Quoted by strike & forward delta, model-priced off the live spot"
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
          <table className="w-full min-w-[860px] text-sm">
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
                <th className="py-1.5 font-medium">Δ</th>
                <th className="py-1.5 font-medium">IV</th>
                <th className="py-1.5 font-medium">Bid</th>
                <th className="py-1.5 font-medium">Ask</th>
                <th className="py-1.5 font-medium text-ink-300">·</th>
                <th className="py-1.5 font-medium">Bid</th>
                <th className="py-1.5 font-medium">Ask</th>
                <th className="py-1.5 font-medium">IV</th>
                <th className="py-1.5 font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map((k) => {
                const c = byStrikeType.get(`${k}-call`);
                const p = byStrikeType.get(`${k}-put`);
                const atm = Math.abs(k - forward) / forward < 0.002;
                return (
                  <tr key={k} className={`border-b border-ink-800/50 text-center font-mono ${atm ? 'bg-accent-500/5' : ''}`}>
                    <td className="py-1.5 text-ink-500">{c ? c.delta.toFixed(2) : '—'}</td>
                    <td className="py-1.5 text-teal-300">{c ? pct(c.iv.iv) : '—'}</td>
                    <td className="py-1.5 text-ink-300">{c ? pipsFmt(c.bid, pipDecimals) : '—'}</td>
                    <td className="py-1.5 text-ink-100">{c ? pipsFmt(c.ask, pipDecimals) : '—'}</td>
                    <td className="py-1.5 font-sans font-semibold text-ink-100">{k.toFixed(4)}</td>
                    <td className="py-1.5 text-ink-300">{p ? pipsFmt(p.bid, pipDecimals) : '—'}</td>
                    <td className="py-1.5 text-ink-100">{p ? pipsFmt(p.ask, pipDecimals) : '—'}</td>
                    <td className="py-1.5 text-rose-300">{p ? pct(p.iv.iv) : '—'}</td>
                    <td className="py-1.5 text-ink-500">{p ? p.delta.toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Bid/ask shown in pips (price × {pipDecimals === 2 ? '100' : '10,000'}).
        </p>
      </Card>

      <Card title="Trade blotter" eyebrow="Buy &amp; sell side" right={<Pill>{chainSet.trades.length} trades</Pill>}>
        <div className="scroll-thin max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-ink-900">
              <tr className="border-b border-ink-700/60 text-[11px] uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Expiry</th>
                <th className="py-2 pr-4 font-medium">Strike</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Side</th>
                <th className="py-2 pr-4 font-medium">Notional ({pair.base}mm)</th>
                <th className="py-2 pr-4 font-medium">Price (pips)</th>
                <th className="py-2 pr-4 font-medium">Counterparty</th>
              </tr>
            </thead>
            <tbody>
              {chainSet.trades.map((t) => (
                <tr key={t.id} className="border-b border-ink-800/50 font-mono">
                  <td className="py-1.5 pr-4 text-ink-400">{t.time}</td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.expiryLabel}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{t.strike.toFixed(4)}</td>
                  <td className="py-1.5 pr-4 capitalize text-ink-300">{t.type}</td>
                  <td className="py-1.5 pr-4">
                    <Pill tone={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</Pill>
                  </td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.size}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{pipsFmt(t.price, pipDecimals)}</td>
                  <td className="py-1.5 pr-4 text-ink-400">{t.counterparty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Put-call parity (forward form)" eyebrow="Verified against traded mid quotes">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p>The FX market risk-manages against the forward, so parity is naturally stated as:</p>
            <MathBlock>{'C - P = (F - K)\\,e^{-r_d T}, \\qquad F = S\\,e^{(r_d-r_f)T}'}</MathBlock>
            <p>Equivalent to the spot form, but this is how a desk actually checks a quoted strangle/risk-reversal.</p>
            <Field label="Strike">
              <select value={activeParityStrike} onChange={(e) => setParityStrike(Number(e.target.value))} className={selectClass}>
                {strikes.map((k) => (
                  <option key={k} value={k}>
                    {k.toFixed(4)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {parity && (
            <div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Call mid (pips)" value={pipsFmt(parity.call, pipDecimals)} />
                <Stat label="Put mid (pips)" value={pipsFmt(parity.put, pipDecimals)} />
                <Stat label="Forward" value={parity.forward.toFixed(4)} />
                <Stat label="C − P (pips)" value={pipsFmt(parity.lhs, pipDecimals)} />
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-850/60 px-4 py-3">
                <Pill tone={parity.holds ? 'up' : 'warn'}>{parity.holds ? 'Parity holds' : 'Deviation flagged'}</Pill>
                <span className="font-mono text-sm text-ink-300">diff {parity.diffPips.toFixed(2)} pips</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Implied vs. realized volatility" eyebrow={`${pair.label} · ATM term structure`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: atmIvByExpiry.map((e) => e.label),
                  y: atmIvByExpiry.map((e) => e.iv * 100),
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: 'ATM implied vol',
                  line: { color: colors.amber, width: 3 },
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
              value={pct((atmIvByExpiry[2]?.iv ?? 0) - rv)}
              tone={(atmIvByExpiry[2]?.iv ?? 0) - rv >= 0 ? 'up' : 'down'}
            />
          </div>
        </Card>

        <Card title="Rolling 21d realized volatility" eyebrow={`${pair.label} spot history`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: rvSeries.map((p) => series?.dates[p.index] ?? p.index),
                  y: rvSeries.map((p) => p.vol * 100),
                  type: 'scatter',
                  mode: 'lines',
                  fill: 'tozeroy',
                  fillcolor: `${colors.amber}1f`,
                  line: { color: colors.amber, width: 2 },
                  name: 'Realized vol',
                },
              ]}
              layout={{ yaxis: { title: { text: 'vol (%)' } } }}
            />
          </div>
        </Card>
      </div>

      <Card title="Implied volatility surface" eyebrow="Smile fit → variance interpolation, by tenor">
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
                    [0.5, colors.amber],
                    [1, colors.rose],
                  ],
                  showscale: false,
                  contours: { z: { show: true, usecolormap: true, project: { z: true } } },
                } as never,
              ]}
              layout={{
                margin: { l: 0, r: 0, t: 10, b: 0 },
                scene: {
                  xaxis: { title: { text: 'log-moneyness k = ln(K/F)' }, gridcolor: colors.grid },
                  yaxis: { title: { text: 'tenor (y)' }, gridcolor: colors.grid },
                  zaxis: { title: { text: 'IV (%)' }, gridcolor: colors.grid },
                  bgcolor: 'transparent',
                },
              }}
            />
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p className="font-medium text-ink-100">Same construction as the equity surface, FX-flavored</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Strikes are inverted to implied vol per tenor (Newton-Raphson/bisection on Garman-Kohlhagen), then
                expressed in log-moneyness against the <em>forward</em>, not spot — the FX market's convention.
              </li>
              <li>
                A quadratic smile <Katex>{'\\sigma(k) = a + bk + ck^2'}</Katex> is fit per tenor by closed-form OLS.
                The linear term <Katex>{'b'}</Katex> corresponds to the market's risk-reversal (skew), and{' '}
                <Katex>{'c'}</Katex> to the butterfly (smile curvature) — both standard FX vol quoting conventions.
              </li>
              <li>
                Total variance <Katex>{'w=\\sigma^2 T'}</Katex> is interpolated linearly across tenors at fixed
                moneyness, then converted back to vol, avoiding an obvious calendar arbitrage in the constructed
                surface.
              </li>
            </ol>
            <p className="text-xs text-ink-500">
              FX smiles are typically flatter and more symmetric than equity skew — currencies don't have the same
              structural "crash" asymmetry a single-name equity or index does.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Risk of a single contract" eyebrow="Garman-Kohlhagen greeks">
        <FxGreeksExplorer pair={pair} spot={spot} domesticRate={domesticRate} foreignRate={foreignRate} chainSet={chainSet} pipDecimals={pipDecimals} />
      </Card>
    </div>
  );
}

function PageHeader({
  pair,
  pairKey,
  setPairKey,
}: {
  pair: FxPairDef;
  pairKey: string;
  setPairKey: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-amber-500">FX Options</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-50">{pair.label} option chain, forward parity &amp; vol surface</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          INR crosses first, then major global pairs. Spot fetched live from an open FX-rate source where possible;
          the chain is priced through Garman-Kohlhagen off that spot.
        </p>
      </div>
      <select value={pairKey} onChange={(e) => setPairKey(e.target.value)} className={selectClass}>
        {fxPairs.map((p) => (
          <option key={`${p.base}${p.quote}`} value={`${p.base}${p.quote}`}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FxGreeksExplorer({
  pair,
  spot,
  domesticRate,
  foreignRate,
  chainSet,
  pipDecimals,
}: {
  pair: FxPairDef;
  spot: number;
  domesticRate: number;
  foreignRate: number;
  chainSet: NonNullable<ReturnType<typeof buildFxOptionChain>>;
  pipDecimals: number;
}) {
  const [expId, setExpId] = useState(chainSet.expiries[2]?.id ?? chainSet.expiries[0].id);
  const exp = chainSet.expiries.find((e) => e.id === expId) ?? chainSet.expiries[0];
  const f = fxForward(spot, domesticRate, foreignRate, exp.T);
  const strikesForExp = Array.from(new Set(chainSet.chain.filter((r) => r.expiryId === expId).map((r) => r.strike))).sort(
    (a, b) => a - b,
  );
  const atmStrike = strikesForExp.reduce((best, k) => (Math.abs(k - f) < Math.abs(best - f) ? k : best), strikesForExp[0]);
  const [strike, setStrike] = useState(atmStrike);
  const [type, setType] = useState<'call' | 'put'>('call');
  const row = chainSet.chain.find((r) => r.expiryId === expId && r.strike === strike && r.type === type);

  const iv = row ? fxImpliedVol(row.mid, { S: spot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, type }) : null;

  const greeks = useMemo(() => {
    if (!iv) return null;
    return gkGreeks({ S: spot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, sigma: iv.iv, type });
  }, [iv, spot, strike, exp.T, domesticRate, foreignRate, type]);

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_auto_auto_1fr] lg:items-end">
      <Field label={`Pair: ${pair.label}`}>
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
              {k.toFixed(4)}
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
          <Stat label="Mid (pips)" value={pipsFmt(row.mid, pipDecimals)} />
          <Stat label="IV" value={pct(iv!.iv)} />
          <Stat label="Delta" value={greeks.delta.toFixed(3)} />
          <Stat label="Gamma" value={greeks.gamma.toFixed(4)} />
          <Stat label="Vega/1%" value={(greeks.vega / 100).toFixed(4)} />
          <Stat label="Theta/day" value={(greeks.theta / 365).toFixed(4)} />
        </div>
      )}
    </div>
  );
}
