import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../lib/theme';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/bonds', label: 'Bonds & Rates' },
  { to: '/equity', label: 'Equity' },
  { to: '/options', label: 'Options' },
  { to: '/fx', label: 'FX' },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-700/60 text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

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
              <div className="text-[11px] text-ink-400">India-first &middot; Bonds &middot; Equity &middot; Options &middot; FX</div>
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
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 py-8 text-xs text-ink-500 sm:px-6">
        Prices and FX rates are fetched live from open, keyless sources where possible; if a live fetch fails
        (network, rate limits, etc.), the page falls back to clearly-labeled sample data. Option chains are always
        priced from real spot/rate inputs through the pricing math shown, not sourced from an exchange feed. Bond
        yields are illustrative sample data — no free live sovereign-curve source exists.
      </footer>
    </div>
  );
}
