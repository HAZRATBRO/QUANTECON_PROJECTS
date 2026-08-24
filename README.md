# QuantEcon Financial Calculator

An interactive financial calculator covering fixed-income risk analytics, equity option analytics,
and FX option analytics — with the underlying numerical methods shown alongside the results.

## What's inside

- **Bonds & Rates** — price/yield mechanics, Newton-Raphson yield-to-maturity solving, duration &
  convexity, a sovereign zero-curve bootstrapped from bills/notes/bonds, and a Nelson-Siegel fit
  (via Nelder-Mead) for a smooth display/interpolation curve.
- **Equity Options** — a sample option chain (calls & puts, bid/ask, open interest) with a buy/sell
  trade blotter, put-call parity verified against real traded mid quotes, implied-vs-realized vol,
  and a 3D implied volatility surface (quadratic smile fit + total-variance interpolation across
  tenors).
- **FX Options** — the same analytics for EUR/USD using the Garman-Kohlhagen model, forward-based
  put-call parity, forward-delta quoting, and a delta/tenor vol surface.

All market data is synthetic sample data generated client-side (seeded, so it's stable across
reloads) — the pricing models and numerical solvers (Newton-Raphson, bisection, Nelder-Mead,
least-squares smile fitting) are the real thing.

## Stack

React + TypeScript + Vite, Tailwind CSS v4, Plotly.js for charting (incl. the 3D vol surface), and
KaTeX for the math.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
npm run lint     # oxlint
```
