// Small fetch helper shared by the live-data providers: times out, and throws
// a plain Error on any non-2xx status so callers can uniformly fall back to
// sample data on *any* failure (network error, CORS block, timeout, bad body).
export async function fetchJson<T>(url: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h || 1;
}

export type DataSource = 'live' | 'sample';
