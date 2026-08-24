import type { ReactNode } from 'react';
import { BlockMath, InlineMath } from 'react-katex';

export function Katex({ children }: { children: string }) {
  return <InlineMath math={children} />;
}

export function MathBlock({ children }: { children: string }) {
  return <BlockMath math={children} />;
}

export function Card({
  title,
  eyebrow,
  right,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-ink-700/60 bg-ink-900/60 backdrop-blur-sm ${className}`}>
      {(title || right || eyebrow) && (
        <div className="flex items-start justify-between gap-4 border-b border-ink-700/60 px-5 py-4">
          <div>
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-widest text-accent-400">{eyebrow}</div>
            )}
            {title && <h2 className="mt-0.5 text-base font-semibold text-ink-50">{title}</h2>}
          </div>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'up' | 'down' }) {
  const toneClass = tone === 'up' ? 'text-teal-400' : tone === 'down' ? 'text-rose-500' : 'text-ink-50';
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-850/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'up' | 'down' | 'warn' }) {
  const toneClass = {
    default: 'bg-ink-700/60 text-ink-200',
    up: 'bg-teal-500/15 text-teal-400',
    down: 'bg-rose-500/15 text-rose-500',
    warn: 'bg-amber-500/15 text-amber-500',
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-300">
      <span className="font-medium uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-sm text-ink-50 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500';

export const selectClass = inputClass + ' cursor-pointer';
