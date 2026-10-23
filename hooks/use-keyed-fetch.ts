"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounced fetch keyed by a string describing the request. Results are
 * stored with their key, so stale data is never shown for a different
 * request and nothing has to be reset synchronously inside an effect.
 * Pass `null` as the key to skip fetching.
 */
export function useKeyedFetch<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>, delayMs = 200) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetcherRef.current(ctrl.signal).then(
        (data) => setResult({ key, data }),
        (err: Error) => {
          if (err.name !== "AbortError") setResult({ key, error: err.message });
        },
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delayMs]);

  const current = key !== null && result?.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
  };
}
