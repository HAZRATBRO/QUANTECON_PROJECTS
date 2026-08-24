import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

const tiles = [
  {
    to: '/bonds',
    title: 'Bonds & Rates',
    tag: 'Newton-Raphson · Bootstrapping · Nelson-Siegel',
    desc: 'Price/yield mechanics, duration & convexity, a sovereign curve built by bootstrapping zero rates from bills/notes/bonds, and a smooth Nelson-Siegel fit.',
    accent: 'from-accent-500/20 to-transparent',
  },
  {
    to: '/options',
    title: 'Equity Options',
    tag: 'Black-Scholes · Implied Vol · Vol Surface',
    desc: 'A live-style option chain with a buy/sell trade blotter, put-call parity verification on real quotes, implied vs. realized vol, and a 3D vol surface.',
    accent: 'from-teal-500/20 to-transparent',
  },
  {
    to: '/fx',
    title: 'FX Options',
    tag: 'Garman-Kohlhagen · Forward Parity · Delta Surface',
    desc: 'EUR/USD option chain and blotter, forward-based put-call parity, implied vs. realized FX vol, and a delta/tenor vol surface.',
    accent: 'from-amber-500/20 to-transparent',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-accent-400">Financial Calculator</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Rates, options and FX analytics — with the math shown, not hidden.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          Every number on this site is computed client-side from the underlying algorithm: Newton-Raphson root
          finding for yields and implied vols, curve bootstrapping, and least-squares smile fitting for the vol
          surfaces. Market data is synthetic and clearly labeled as sample data — the models and solvers are real.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group block">
            <Card className={`h-full bg-gradient-to-br ${t.accent} transition-transform group-hover:-translate-y-0.5 group-hover:border-ink-500`}>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-accent-400">{t.tag}</div>
              <h3 className="mt-2 text-lg font-semibold text-ink-50">{t.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{t.desc}</p>
              <div className="mt-4 text-sm font-medium text-accent-400 group-hover:text-accent-300">
                Open calculator &rarr;
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card title="What's under the hood" eyebrow="Methodology">
        <div className="grid gap-6 text-sm text-ink-300 md:grid-cols-3">
          <div>
            <div className="font-semibold text-ink-100">Root finding</div>
            <p className="mt-1 leading-relaxed">
              Bond yield-to-maturity and every implied volatility on this site is solved with Newton-Raphson using
              an analytic derivative (price sensitivity to yield, or vega), with a bracketed bisection fallback when
              the derivative collapses.
            </p>
          </div>
          <div>
            <div className="font-semibold text-ink-100">Curve & surface construction</div>
            <p className="mt-1 leading-relaxed">
              The rates curve is bootstrapped instrument-by-instrument then fit with a 4-parameter Nelson-Siegel
              model via Nelder-Mead. Vol surfaces fit a quadratic smile per expiry and interpolate total variance
              across tenors.
            </p>
          </div>
          <div>
            <div className="font-semibold text-ink-100">Consistency checks</div>
            <p className="mt-1 leading-relaxed">
              Put-call parity is evaluated against traded bid/ask/mid quotes for matched strikes, and realized vol
              is computed independently from the underlying's own price history for comparison against the market's
              implied vol.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
