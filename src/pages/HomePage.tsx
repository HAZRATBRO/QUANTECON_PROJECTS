import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, inputClass } from '../components/ui';

const NAME_KEY = 'qec-username';

function readStoredName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null; // localStorage unavailable (private browsing, etc.) — fall back to the anonymous greeting.
  }
}

const tiles = [
  {
    to: '/bonds',
    title: 'Bonds & Rates',
    tag: 'Newton-Raphson · Bootstrapping · Nelson-Siegel',
    desc: 'Price/yield mechanics, duration & convexity, an Indian G-Sec curve built by bootstrapping zero rates from T-Bills/G-Secs, and a smooth Nelson-Siegel fit.',
    accent: 'from-accent-500/20 to-transparent',
  },
  {
    to: '/equity',
    title: 'Equity',
    tag: 'Live Quotes · Realized Vol · Single-Stock Pricer',
    desc: "Live-fetched quotes and price history for NSE/BSE names (NIFTY, SENSEX, top stocks) and global tickers, with realized vol and a per-stock option pricer.",
    accent: 'from-rose-500/20 to-transparent',
  },
  {
    to: '/options',
    title: 'Equity Options',
    tag: 'Black-Scholes · Implied Vol · Vol Surface',
    desc: 'Pick any stock or index — a live spot feeds an option chain with a buy/sell trade blotter, put-call parity verification, implied vs. realized vol, and a 3D vol surface.',
    accent: 'from-teal-500/20 to-transparent',
  },
  {
    to: '/fx',
    title: 'FX Options',
    tag: 'Garman-Kohlhagen · Forward Parity · Delta Surface',
    desc: 'USD/INR and other India-first pairs by default, live spot, forward-based put-call parity, implied vs. realized FX vol, and a delta/tenor vol surface.',
    accent: 'from-amber-500/20 to-transparent',
  },
];

function WelcomeBar() {
  const [name, setName] = useState<string | null>(readStoredName);
  const [draft, setDraft] = useState('');

  function save(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setName(trimmed);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // ignore — greeting still works for this session
    }
  }

  if (name) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-700/60 bg-ink-900/60 px-5 py-3">
        <p className="text-sm text-ink-200">
          Welcome back, <span className="font-semibold text-ink-50">{name}</span> — pick up where you left off below.
        </p>
        <button
          type="button"
          onClick={() => {
            setName(null);
            setDraft('');
            try {
              localStorage.removeItem(NAME_KEY);
            } catch {
              // ignore
            }
          }}
          className="text-xs font-medium text-ink-400 hover:text-ink-100"
        >
          Not you? Reset
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-700/60 bg-ink-900/60 px-5 py-3"
    >
      <label htmlFor="username" className="text-sm text-ink-300">
        What should we call you?
      </label>
      <input
        id="username"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Your name"
        maxLength={40}
        className={inputClass + ' w-48'}
      />
      <button
        type="submit"
        className="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-ink-950 transition-colors hover:bg-accent-400 disabled:opacity-40"
        disabled={!draft.trim()}
      >
        Save
      </button>
    </form>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-8">
      <WelcomeBar />

      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-accent-400">Financial Calculator · India-first</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Rates, equities, options and FX — with the math shown, not hidden.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-300">
          NSE/BSE names and INR pairs come first, with major global markets alongside. Equity and FX prices are
          fetched live from open, keyless sources directly in your browser; option chains are always priced from
          those real inputs through the Newton-Raphson, Black-Scholes/Garman-Kohlhagen and vol-surface math shown on
          each page, not sourced from an exchange feed. Where a live fetch can't succeed (network, rate limits,
          browser CORS policy) or no free live source exists at all (sovereign bond yields), the page falls back to
          clearly-labeled sample data — the models and solvers are always real.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-6 text-sm text-ink-300 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="font-semibold text-ink-100">Live data, honestly labeled</div>
            <p className="mt-1 leading-relaxed">
              Equity and FX pages fetch spot prices and history from open, keyless sources at page load. Every page
              shows a "Live" or "Sample data" badge so it's never ambiguous which one you're looking at.
            </p>
          </div>
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
