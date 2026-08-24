import { useEffect, useRef, useState } from 'react';

/**
 * Runs `fetcher` whenever `deps` changes, ignoring stale results if a newer
 * call started before an older one resolved (e.g. rapid symbol switching).
 * Providers never reject (they fall back internally), so this only tracks
 * loading/data, not an error state.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const mySeq = ++seq.current;
    setLoading(true);
    fetcher().then((result) => {
      if (cancelled || mySeq !== seq.current) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps is an intentional caller-supplied array
  }, deps);

  return { data, loading };
}
