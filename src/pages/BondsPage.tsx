import { useMemo, useState } from 'react';
import DarkPlot, { plotColors } from '../components/DarkPlot';
import { Card, Field, Katex, MathBlock, Pill, selectClass, Stat } from '../components/ui';
import { bondInstruments } from '../data/bondInstruments';
import {
  analyzeBond,
  bootstrapZeroCurve,
  fitNelsonSiegel,
  generateCashflows,
  nelsonSiegelCurve,
  priceFromYield,
  type BondRisk,
} from '../lib/finance/bonds';
import { linspace } from '../lib/finance/optim';

function pct(x: number, dp = 3) {
  return `${(x * 100).toFixed(dp)}%`;
}

export default function BondsPage() {
  const analyses = useMemo<Record<string, BondRisk>>(() => {
    const map: Record<string, BondRisk> = {};
    for (const inst of bondInstruments) map[inst.id] = analyzeBond(inst);
    return map;
  }, []);

  const zeroCurve = useMemo(() => bootstrapZeroCurve(bondInstruments), []);
  const nsParams = useMemo(() => fitNelsonSiegel(zeroCurve), [zeroCurve]);
  const nsCurve = useMemo(() => nelsonSiegelCurve(nsParams, 32, 150), [nsParams]);

  const [selectedId, setSelectedId] = useState(bondInstruments[5]?.id ?? bondInstruments[0].id);
  const selectedInst = bondInstruments.find((b) => b.id === selectedId)!;
  const selectedAnalysis = analyses[selectedId];

  const { curveData, iterMarkers } = useMemo(() => {
    const flows = generateCashflows(selectedInst);
    const target = selectedInst.price;
    const yStar = selectedAnalysis.ytm.ytm;
    const lo = Math.max(0.001, yStar - 0.035);
    const hi = yStar + 0.035;
    const ys = linspace(lo, hi, 120);
    const fs = ys.map((y) => priceFromYield(flows, y, selectedInst.freq) - target);
    const iterations = selectedAnalysis.ytm.iterations;
    return {
      curveData: { ys, fs },
      iterMarkers: iterations,
    };
  }, [selectedInst, selectedAnalysis]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-accent-400">Bonds &amp; Rates</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-50">Bond pricing, risk &amp; the yield curve</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-300">
          Prices below are sample market quotes; every yield, duration, convexity figure and curve point is derived
          from them live using the methods described here.
        </p>
      </div>

      <Card title="Price / yield relationship" eyebrow="Theory">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p>
              A coupon bond is a strip of fixed cashflows discounted at a single flat yield <Katex>{'y'}</Katex>,
              compounded <Katex>{'f'}</Katex> times a year:
            </p>
            <MathBlock>{'P(y) = \\sum_{i=1}^{n} \\dfrac{CF_i}{\\left(1 + y/f\\right)^{\\,i}}'}</MathBlock>
            <p>
              Given a market price, there is no closed form for <Katex>{'y'}</Katex> once there is more than one
              cashflow, so we solve <Katex>{'P(y) - P_{mkt} = 0'}</Katex> with{' '}
              <span className="font-medium text-ink-100">Newton-Raphson</span>, using the analytic derivative:
            </p>
            <MathBlock>{'y_{k+1} = y_k - \\dfrac{P(y_k) - P_{mkt}}{P\\,\'(y_k)}, \\qquad P\\,\'(y) = -\\dfrac{1}{f}\\sum_{i=1}^n \\dfrac{i \\cdot CF_i}{(1+y/f)^{\\,i+1}}'}</MathBlock>
            <p>
              Because <Katex>{'P(y)'}</Katex> is smooth, monotonic and nearly linear near the root, Newton-Raphson
              typically converges to 1e-9 price error in 3-5 iterations from a reasonable starting guess.
            </p>
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p>Risk sensitivities used in the table below come from the same cashflow set:</p>
            <MathBlock>{'D_{mac} = \\dfrac{1}{P}\\sum_{i=1}^n \\dfrac{i}{f}\\cdot \\dfrac{CF_i}{(1+y/f)^{\\,i}}, \\qquad D_{mod} = \\dfrac{D_{mac}}{1+y/f}'}</MathBlock>
            <MathBlock>{'C = \\dfrac{1}{P f^2}\\sum_{i=1}^n \\dfrac{i(i+1)\\cdot CF_i}{(1+y/f)^{\\,i+2}}'}</MathBlock>
            <p>
              Modified duration approximates the percentage price change for a 1bp yield move; convexity is the
              second-order correction, material for long-dated bonds:
            </p>
            <MathBlock>{'\\dfrac{\\Delta P}{P} \\approx -D_{mod}\\,\\Delta y + \\tfrac{1}{2} C\\,(\\Delta y)^2'}</MathBlock>
          </div>
        </div>
      </Card>

      <Card title="Instruments" eyebrow="Sample curve inputs" right={<Pill>{bondInstruments.length} instruments</Pill>}>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700/60 text-[11px] uppercase tracking-wide text-ink-400">
                <th className="py-2 pr-4 font-medium">Instrument</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Maturity</th>
                <th className="py-2 pr-4 font-medium">Coupon</th>
                <th className="py-2 pr-4 font-medium">Price</th>
                <th className="py-2 pr-4 font-medium">YTM (N-R)</th>
                <th className="py-2 pr-4 font-medium">Mod. Dur.</th>
                <th className="py-2 pr-4 font-medium">Convexity</th>
                <th className="py-2 pr-4 font-medium">DV01</th>
                <th className="py-2 pr-4 font-medium">Solver</th>
              </tr>
            </thead>
            <tbody>
              {bondInstruments.map((inst) => {
                const a = analyses[inst.id];
                return (
                  <tr
                    key={inst.id}
                    onClick={() => setSelectedId(inst.id)}
                    className={`cursor-pointer border-b border-ink-800/60 transition-colors hover:bg-ink-800/40 ${
                      selectedId === inst.id ? 'bg-accent-500/10' : ''
                    }`}
                  >
                    <td className="py-2 pr-4 font-medium text-ink-100">{inst.label}</td>
                    <td className="py-2 pr-4 capitalize text-ink-300">{inst.type}</td>
                    <td className="py-2 pr-4 font-mono text-ink-300">{inst.maturityYears}Y</td>
                    <td className="py-2 pr-4 font-mono text-ink-300">{inst.couponRate ? pct(inst.couponRate, 2) : '—'}</td>
                    <td className="py-2 pr-4 font-mono text-ink-100">{inst.price.toFixed(3)}</td>
                    <td className="py-2 pr-4 font-mono text-accent-300">{pct(a.ytm.ytm)}</td>
                    <td className="py-2 pr-4 font-mono text-ink-300">{a.modified.toFixed(2)}</td>
                    <td className="py-2 pr-4 font-mono text-ink-300">{a.convexity.toFixed(2)}</td>
                    <td className="py-2 pr-4 font-mono text-ink-300">{a.dv01.toFixed(4)}</td>
                    <td className="py-2 pr-4">
                      <Pill tone={a.ytm.converged ? 'up' : 'warn'}>{a.ytm.iterations.length} iters</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-500">Click a row to inspect its Newton-Raphson convergence path below.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card
          title={`Newton-Raphson convergence — ${selectedInst.label}`}
          eyebrow="Root finding, visualized"
          right={<Pill tone={selectedAnalysis.ytm.converged ? 'up' : 'warn'}>{pct(selectedAnalysis.ytm.ytm)}</Pill>}
        >
          <div className="h-72">
            <DarkPlot
              data={[
                {
                  x: curveData.ys.map((y) => y * 100),
                  y: curveData.fs,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'f(y) = P(y) − P_mkt',
                  line: { color: plotColors.line, width: 2 },
                },
                {
                  x: [curveData.ys[0] * 100, curveData.ys[curveData.ys.length - 1] * 100],
                  y: [0, 0],
                  type: 'scatter',
                  mode: 'lines',
                  showlegend: false,
                  line: { color: plotColors.grid, width: 1, dash: 'dot' },
                },
                {
                  x: iterMarkers.map((it) => it.x * 100),
                  y: iterMarkers.map((it) => it.fx),
                  type: 'scatter',
                  mode: 'lines+markers',
                  name: 'Newton iterations',
                  marker: { color: plotColors.amber, size: 8 },
                  line: { color: plotColors.amber, width: 1, dash: 'dash' },
                },
              ]}
              layout={{
                xaxis: { title: { text: 'yield y (%)' } },
                yaxis: { title: { text: 'price error f(y)' } },
                legend: { orientation: 'h', y: -0.2 },
              }}
            />
          </div>
          <div className="scroll-thin mt-3 max-h-40 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-500">
                <tr>
                  <th className="py-1 pr-3">k</th>
                  <th className="py-1 pr-3">y_k</th>
                  <th className="py-1 pr-3">f(y_k)</th>
                  <th className="py-1 pr-3">f'(y_k)</th>
                </tr>
              </thead>
              <tbody className="font-mono text-ink-300">
                {selectedAnalysis.ytm.iterations.map((it) => (
                  <tr key={it.iter} className="border-t border-ink-800/60">
                    <td className="py-1 pr-3">{it.iter}</td>
                    <td className="py-1 pr-3">{pct(it.x, 4)}</td>
                    <td className="py-1 pr-3">{it.fx.toFixed(6)}</td>
                    <td className="py-1 pr-3">{it.fpx.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Risk snapshot" eyebrow={selectedInst.label}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Clean price" value={selectedInst.price.toFixed(3)} />
            <Stat label="YTM" value={pct(selectedAnalysis.ytm.ytm)} />
            <Stat label="Macaulay duration" value={`${selectedAnalysis.macaulay.toFixed(2)}y`} />
            <Stat label="Modified duration" value={selectedAnalysis.modified.toFixed(2)} />
            <Stat label="Convexity" value={selectedAnalysis.convexity.toFixed(2)} />
            <Stat label="DV01 (per 100 face)" value={selectedAnalysis.dv01.toFixed(4)} />
          </div>
          <div className="mt-4 space-y-2 text-xs leading-relaxed text-ink-400">
            <p>
              A +100bp / -100bp shock via the duration-convexity approximation:{' '}
              <span className="font-mono text-ink-200">
                {((-selectedAnalysis.modified * 0.01 + 0.5 * selectedAnalysis.convexity * 0.01 ** 2) * 100).toFixed(2)}%
              </span>{' '}
              /{' '}
              <span className="font-mono text-ink-200">
                {((selectedAnalysis.modified * 0.01 + 0.5 * selectedAnalysis.convexity * 0.01 ** 2) * 100).toFixed(2)}%
              </span>
            </p>
          </div>
        </Card>
      </div>

      <Card title="Zero curve bootstrapping" eyebrow="Algorithm">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm leading-relaxed text-ink-300">
            <p>
              Instruments are sorted by maturity. For each one, every cashflow <em>before</em> its final payment is
              discounted using the zero curve already built (linearly interpolated in continuously-compounded zero
              rate). The unknown is the zero rate at that instrument's own maturity <Katex>{'T'}</Katex>, solved so the
              discounted cashflows reproduce the market price:
            </p>
            <MathBlock>{'P = \\underbrace{\\sum_{t_i < T} CF_i\\, e^{-z(t_i)\\,t_i}}_{\\text{known from curve so far}} + CF_T\\, e^{-z(T)\\,T}'}</MathBlock>
            <p>
              This isolates a single unknown, <Katex>{'z(T)'}</Katex>, again solved with Newton-Raphson on{' '}
              <Katex>{'g(z) = CF_T e^{-zT} - \\text{residual} = 0'}</Katex>. Repeating instrument-by-instrument
              "strips" a full zero curve out of coupon-bearing prices.
            </p>
            <p>
              The bootstrapped points are then fit to a smooth 4-parameter{' '}
              <span className="font-medium text-ink-100">Nelson-Siegel</span> curve (level, slope, curvature, decay)
              by minimizing squared error with a derivative-free{' '}
              <span className="font-medium text-ink-100">Nelder-Mead</span> simplex search — useful for interpolating
              /extrapolating maturities with no direct instrument.
            </p>
            <MathBlock>{'y(t) = \\beta_0 + \\beta_1\\frac{1-e^{-t/\\tau}}{t/\\tau} + \\beta_2\\left(\\frac{1-e^{-t/\\tau}}{t/\\tau} - e^{-t/\\tau}\\right)'}</MathBlock>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs text-ink-400 sm:grid-cols-4">
              <span>β₀ {nsParams.beta0.toFixed(4)}</span>
              <span>β₁ {nsParams.beta1.toFixed(4)}</span>
              <span>β₂ {nsParams.beta2.toFixed(4)}</span>
              <span>τ {nsParams.tau.toFixed(3)}</span>
            </div>
          </div>
          <div className="h-80">
            <DarkPlot
              data={[
                {
                  x: nsCurve.map((p) => p.t),
                  y: nsCurve.map((p) => p.y * 100),
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Nelson-Siegel fit',
                  line: { color: plotColors.accent, width: 3 },
                },
                {
                  x: zeroCurve.map((p) => p.t),
                  y: zeroCurve.map((p) => p.z * 100),
                  type: 'scatter',
                  mode: 'markers',
                  name: 'Bootstrapped zero',
                  marker: { color: plotColors.teal, size: 9, symbol: 'diamond' },
                },
              ]}
              layout={{
                xaxis: { title: { text: 'maturity (years)' } },
                yaxis: { title: { text: 'zero rate (%)' } },
                legend: { orientation: 'h', y: -0.2 },
              }}
            />
          </div>
        </div>
      </Card>

      <YieldPicker analyses={analyses} />
    </div>
  );
}

function YieldPicker({ analyses }: { analyses: Record<string, BondRisk> }) {
  const [shock, setShock] = useState(0);
  return (
    <Card title="Parallel shock sensitivity" eyebrow="Duration-convexity approximation">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Yield shock (bp)">
          <input
            type="range"
            min={-200}
            max={200}
            step={5}
            value={shock}
            onChange={(e) => setShock(Number(e.target.value))}
            className="w-64 accent-accent-500"
          />
        </Field>
        <span className={selectClass + ' pointer-events-none border-none bg-transparent font-mono text-base text-ink-50'}>
          {shock > 0 ? '+' : ''}
          {shock}bp
        </span>
      </div>
      <div className="scroll-thin mt-4 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700/60 text-[11px] uppercase tracking-wide text-ink-400">
              <th className="py-2 pr-4 font-medium">Instrument</th>
              <th className="py-2 pr-4 font-medium">Price</th>
              <th className="py-2 pr-4 font-medium">Est. Δ%</th>
              <th className="py-2 pr-4 font-medium">Shocked price</th>
            </tr>
          </thead>
          <tbody>
            {bondInstruments.map((inst) => {
              const a = analyses[inst.id];
              const dy = shock / 10000;
              const pctChange = -a.modified * dy + 0.5 * a.convexity * dy * dy;
              return (
                <tr key={inst.id} className="border-b border-ink-800/60">
                  <td className="py-2 pr-4 text-ink-100">{inst.label}</td>
                  <td className="py-2 pr-4 font-mono text-ink-300">{inst.price.toFixed(3)}</td>
                  <td className={`py-2 pr-4 font-mono ${pctChange >= 0 ? 'text-teal-400' : 'text-rose-500'}`}>
                    {(pctChange * 100).toFixed(3)}%
                  </td>
                  <td className="py-2 pr-4 font-mono text-ink-100">{(inst.price * (1 + pctChange)).toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
