import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/bonds', label: 'Bonds & Rates' },
  { to: '/options', label: 'Options' },
  { to: '/fx', label: 'FX' },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(79,124,255,0.12),transparent),radial-gradient(1000px_500px_at_100%_0%,rgba(34,200,176,0.08),transparent)]">
      <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-teal-500 font-mono text-sm font-bold text-ink-950">
              Q
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink-50">QuantEcon Calculator</div>
              <div className="text-[11px] text-ink-400">Bonds &middot; Options &middot; FX</div>
            </div>
          </div>
          <nav className="ml-auto flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-accent-500/15 text-accent-300' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 py-8 text-xs text-ink-500 sm:px-6">
        All market data on this site is synthetic sample data generated for illustration, not live prices. Formulas
        and numerical methods are the real thing.
      </footer>
    </div>
  );
}
