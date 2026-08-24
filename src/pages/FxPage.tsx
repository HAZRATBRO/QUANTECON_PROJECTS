import { useMemo, useState } from 'react';
import DarkPlot, { plotColors } from '../components/DarkPlot';
import { Card, Field, Katex, MathBlock, Pill, selectClass, Stat } from '../components/ui';
import { domesticRate, foreignRate, fxChain, fxExpiries, fxTrades } from '../data/fxOptionsChain';
import { fxPair, fxSpot, fxSpotHistory } from '../data/priceHistory';
import { checkFxPutCallParity, forwardDelta, fxForward, fxImpliedVol, gkGreeks } from '../lib/finance/fx';
import { buildVolSurface, fitQuadraticSmile, realizedVol, rollingRealizedVol, type SmileFit } from '../lib/finance/vol';

function pct(x: number, dp = 2) {
  return `${(x * 100).toFixed(dp)}%`;
}
function pips(x: number, dp = 1) {
  return `${(x * 10000).toFixed(dp)}`;
}

export default function FxPage() {
  const [expiryId, setExpiryId] = useState(fxExpiries[2].id);
  const expiry = fxExpiries.find((e) => e.id === expiryId)!;

  const rowsForExpiry = useMemo(() => fxChain.filter((r) => r.expiryId === expiryId), [expiryId]);
  const forward = useMemo(() => fxForward(fxSpot, domesticRate, foreignRate, expiry.T), [expiry.T]);

  const rowsWithIv = useMemo(
    () =>
      rowsForExpiry.map((r) => {
        const iv = fxImpliedVol(r.mid, { S: fxSpot, K: r.strike, T: r.T, rd: domesticRate, rf: foreignRate, type: r.type });
        const delta = forwardDelta({ S: fxSpot, K: r.strike, T: r.T, rd: domesticRate, rf: foreignRate, sigma: iv.iv, type: r.type });
        return { ...r, iv, delta };
      }),
    [rowsForExpiry],
  );

  const strikes = useMemo(() => Array.from(new Set(rowsWithIv.map((r) => r.strike))).sort((a, b) => a - b), [rowsWithIv]);
  const byStrikeType = useMemo(() => {
    const m = new Map<string, (typeof rowsWithIv)[number]>();
    for (const r of rowsWithIv) m.set(`${r.strike}-${r.type}`, r);
    return m;
  }, [rowsWithIv]);

  const [parityStrike, setParityStrike] = useState<number>(strikes[Math.floor(strikes.length / 2)]);
  const call = byStrikeType.get(`${parityStrike}-call`);
  const put = byStrikeType.get(`${parityStrike}-put`);
  const parity = useMemo(() => {
    if (!call || !put) return null;
    return checkFxPutCallParity(call.mid, put.mid, fxSpot, parityStrike, domesticRate, foreignRate, expiry.T);
  }, [call, put, parityStrike, expiry.T]);

  const rv = useMemo(() => realizedVol(fxSpotHistory.map((p) => p.close), 252), []);
  const rvSeries = useMemo(() => rollingRealizedVol(fxSpotHistory.map((p) => p.close), 21), []);

  const atmIvByExpiry = useMemo(() => {
    return fxExpiries.map((e) => {
      const rows = fxChain.filter((r) => r.expiryId === e.id);
      const f = fxForward(fxSpot, domesticRate, foreignRate, e.T);
      const atmStrike = rows.reduce((best, r) => (Math.abs(r.strike - f) < Math.abs(best.strike - f) ? r : best), rows[0]);
      const callRow = rows.find((r) => r.strike === atmStrike.strike && r.type === 'call')!;
      const iv = fxImpliedVol(callRow.mid, { S: fxSpot, K: callRow.strike, T: e.T, rd: domesticRate, rf: foreignRate, type: 'call' });
      return { label: e.label, T: e.T, iv: iv.iv };
    });
  }, []);

  const smiles = useMemo<SmileFit[]>(() => {
    return fxExpiries.map((e) => {
      const rows = fxChain.filter((r) => r.expiryId === e.id);
      const f = fxForward(fxSpot, domesticRate, foreignRate, e.T);
      const pts = rows
        .filter((r) => r.type === (r.strike >= f ? 'call' : 'put'))
        .map((r) => {
          const iv = fxImpliedVol(r.mid, { S: fxSpot, K: r.strike, T: e.T, rd: domesticRate, rf: foreignRate, type: r.type });
          return { k: Math.log(r.strike / f), iv: iv.iv };
        });
      return fitQuadraticSmile(e.T, pts);
    });
  }, []);

  const surface = useMemo(() => buildVolSurface(smiles, [-0.15, 0.15]), [smiles]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-amber-500">FX Options</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-50">{fxPair} option chain, forward parity &amp; vol surface</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          Spot <span className="font-mono text-ink-100">{fxSpot.toFixed(4)}</span> &middot; r_d (USD){' '}
          <span className="font-mono text-ink-100">{pct(domesticRate)}</span> &middot; r_f (EUR){' '}
          <span className="font-mono text-ink-100">{pct(foreignRate)}</span> &middot; {expiry.label} forward{' '}
          <span className="font-mono text-ink-100">{forward.toFixed(4)}</span>. Synthetic sample data.
        </p>
      </div>

      <Card
        title="Garman-Kohlhagen pricing"
        eyebrow="Theory — FX is Black-Scholes with two curves"
      >
        <div className="grid gap-6 lg:grid-cols-2 text-sm leading-relaxed text-ink-300">
          <div className="space-y-3">
            <p>
              An FX option's underlying carries a "yield" too: the foreign risk-free rate{' '}
              <Katex>{'r_f'}</Katex>, playing the same role a dividend yield plays for equities. The price is
              Black-Scholes with <Katex>{'q \\to r_f'}</Katex> and <Katex>{'r \\to r_d'}</Katex>:
            </p>
            <MathBlock>{'C = S\\,e^{-r_f T}N(d_1) - K\\,e^{-r_d T}N(d_2)'}</MathBlock>
            <MathBlock>{'d_1 = \\dfrac{\\ln(S/K) + (r_d - r_f + \\sigma^2/2)T}{\\sigma\\sqrt{T}}, \\quad d_2 = d_1 - \\sigma\\sqrt{T}'}</MathBlock>
          </div>
          <div className="space-y-3">
            <p>
              The FX market quotes strikes by <span className="font-medium text-ink-100">forward delta</span> rather
              than absolute levels, and prices relative to the forward{' '}
              <Katex>{'F = S\\,e^{(r_d-r_f)T}'}</Katex>:
            </p>
            <MathBlock>{'\\Delta_{fwd} = N(d_1),\\qquad d_1 = \\dfrac{\\ln(F/K) + \\sigma^2 T/2}{\\sigma\\sqrt{T}}'}</MathBlock>
            <p>
              Implied vol is again solved by Newton-Raphson on price vs. vega, with bisection fallback for
              deep-delta strikes where vega is small.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Option chain"
        eyebrow="Live-style quotes, quoted by strike &amp; forward delta"
        right={
          <select value={expiryId} onChange={(e) => setExpiryId(e.target.value)} className={selectClass}>
            {fxExpiries.map((e) => (
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
                    <td className="py-1.5 text-ink-300">{c ? pips(c.bid) : '—'}</td>
                    <td className="py-1.5 text-ink-100">{c ? pips(c.ask) : '—'}</td>
                    <td className="py-1.5 font-sans font-semibold text-ink-100">{k.toFixed(4)}</td>
                    <td className="py-1.5 text-ink-300">{p ? pips(p.bid) : '—'}</td>
                    <td className="py-1.5 text-ink-100">{p ? pips(p.ask) : '—'}</td>
                    <td className="py-1.5 text-rose-300">{p ? pct(p.iv.iv) : '—'}</td>
                    <td className="py-1.5 text-ink-500">{p ? p.delta.toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">Bid/ask shown in pips (price × 10,000).</p>
      </Card>

      <Card title="Trade blotter" eyebrow="Buy &amp; sell side" right={<Pill>{fxTrades.length} trades</Pill>}>
        <div className="scroll-thin max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-ink-900">
              <tr className="border-b border-ink-700/60 text-[11px] uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Expiry</th>
                <th className="py-2 pr-4 font-medium">Strike</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Side</th>
                <th className="py-2 pr-4 font-medium">Notional (EURmm)</th>
                <th className="py-2 pr-4 font-medium">Price (pips)</th>
                <th className="py-2 pr-4 font-medium">Counterparty</th>
              </tr>
            </thead>
            <tbody>
              {fxTrades.map((t) => (
                <tr key={t.id} className="border-b border-ink-800/50 font-mono">
                  <td className="py-1.5 pr-4 text-ink-400">{t.time}</td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.expiryLabel}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{t.strike.toFixed(4)}</td>
                  <td className="py-1.5 pr-4 capitalize text-ink-300">{t.type}</td>
                  <td className="py-1.5 pr-4">
                    <Pill tone={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</Pill>
                  </td>
                  <td className="py-1.5 pr-4 text-ink-300">{t.size}</td>
                  <td className="py-1.5 pr-4 text-ink-100">{pips(t.price)}</td>
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
              <select value={parityStrike} onChange={(e) => setParityStrike(Number(e.target.value))} className={selectClass}>
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
                <Stat label="Call mid (pips)" value={pips(parity.call)} />
                <Stat label="Put mid (pips)" value={pips(parity.put)} />
                <Stat label="Forward" value={parity.forward.toFixed(4)} />
                <Stat label="C − P (pips)" value={pips(parity.lhs)} />
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
        <Card title="Implied vs. realized volatility" eyebrow={`${fxPair} · ATM term structure`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: atmIvByExpiry.map((e) => e.label),
                  y: atmIvByExpiry.map((e) => e.iv * 100),
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: 'ATM implied vol',
                  line: { color: plotColors.amber, width: 3 },
                  marker: { size: 7 },
                },
                {
                  x: atmIvByExpiry.map((e) => e.label),
                  y: atmIvByExpiry.map(() => rv * 100),
                  type: 'scatter',
                  mode: 'lines',
                  name: '21d realized vol (flat ref.)',
                  line: { color: plotColors.teal, width: 2, dash: 'dash' },
                },
              ]}
              layout={{ yaxis: { title: { text: 'vol (%)' } }, legend: { orientation: 'h', y: -0.2 } }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Realized vol (1y, ann.)" value={pct(rv)} />
            <Stat
              label="ATM IV − RV spread"
              value={pct(atmIvByExpiry[2]?.iv - rv)}
              tone={atmIvByExpiry[2]?.iv - rv >= 0 ? 'up' : 'down'}
            />
          </div>
        </Card>

        <Card title="Rolling 21d realized volatility" eyebrow={`${fxPair} spot history`}>
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: rvSeries.map((p) => p.index),
                  y: rvSeries.map((p) => p.vol * 100),
                  type: 'scatter',
                  mode: 'lines',
                  fill: 'tozeroy',
                  fillcolor: 'rgba(242,169,60,0.12)',
                  line: { color: plotColors.amber, width: 2 },
                  name: 'Realized vol',
                },
              ]}
              layout={{ xaxis: { title: { text: 'trading day index' } }, yaxis: { title: { text: 'vol (%)' } } }}
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
                    [0, '#22c8b0'],
                    [0.5, '#f2a93c'],
                    [1, '#f2495c'],
                  ],
                  showscale: false,
                  contours: { z: { show: true, usecolormap: true, project: { z: true } } },
                } as never,
              ]}
              layout={{
                margin: { l: 0, r: 0, t: 10, b: 0 },
                scene: {
                  xaxis: { title: { text: 'log-moneyness k = ln(K/F)' }, gridcolor: plotColors.grid },
                  yaxis: { title: { text: 'tenor (y)' }, gridcolor: plotColors.grid },
                  zaxis: { title: { text: 'IV (%)' }, gridcolor: plotColors.grid },
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
        <FxGreeksExplorer />
      </Card>
    </div>
  );
}

function FxGreeksExplorer() {
  const [expId, setExpId] = useState(fxExpiries[2].id);
  const exp = fxExpiries.find((e) => e.id === expId)!;
  const f = fxForward(fxSpot, domesticRate, foreignRate, exp.T);
  const strikesForExp = Array.from(new Set(fxChain.filter((r) => r.expiryId === expId).map((r) => r.strike))).sort((a, b) => a - b);
  const atmStrike = strikesForExp.reduce((best, k) => (Math.abs(k - f) < Math.abs(best - f) ? k : best), strikesForExp[0]);
  const [strike, setStrike] = useState(atmStrike);
  const [type, setType] = useState<'call' | 'put'>('call');
  const row = fxChain.find((r) => r.expiryId === expId && r.strike === strike && r.type === type);

  const iv = row ? fxImpliedVol(row.mid, { S: fxSpot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, type }) : null;

  const greeks = useMemo(() => {
    if (!iv) return null;
    return gkGreeks({ S: fxSpot, K: strike, T: exp.T, rd: domesticRate, rf: foreignRate, sigma: iv.iv, type });
  }, [iv, strike, exp.T, type]);

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_auto_auto_1fr] lg:items-end">
      <Field label="Expiry">
        <select value={expId} onChange={(e) => setExpId(e.target.value)} className={selectClass}>
          {fxExpiries.map((e) => (
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
          <Stat label="Mid (pips)" value={pips(row.mid)} />
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
