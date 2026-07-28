// Lazily verifies that Yad2 ad URLs still resolve to a live ad.
// Results are cached per-session so the table never re-probes the same URL.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AdStatus = 'live' | 'gone' | 'unknown' | 'checking';

export type AdDates = { published_at: string | null; updated_at: string | null };

const cache = new Map<string, AdStatus>();
const dateCache = new Map<string, AdDates>();
const listeners = new Set<() => void>();
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() { listeners.forEach((l) => l()); }

async function flush() {
  timer = null;
  const batch = pending.splice(0, 4);
  if (!batch.length) return;
  try {
    const { data, error } = await supabase.functions.invoke('yad2-ad-status', { body: { urls: batch } });
    const statuses = (data as any)?.statuses ?? {};
    const dates = (data as any)?.dates ?? {};
    for (const u of batch) {
      const d = dates[u];
      if (d && (d.published_at || d.updated_at)) dateCache.set(u, d);
    }
    for (const u of batch) {
      const s = error ? 'unknown' : (statuses[u] as AdStatus | undefined) ?? 'unknown';
      cache.set(u, s);
    }
  } catch {
    for (const u of batch) cache.set(u, 'unknown');
  }
  notify();
  if (pending.length && !timer) timer = setTimeout(flush, 300);
}

function enqueue(url: string) {
  if (cache.has(url)) return;
  cache.set(url, 'checking');
  pending.push(url);
  if (!timer) timer = setTimeout(flush, 250);
}

/** Returns the cached/live-probed status of a single Yad2 ad URL. */
export function useYad2AdStatus(url: string | null | undefined): AdStatus {
  const [, force] = useState(0);

  useEffect(() => {
    if (!url) return;
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    enqueue(url);
    return () => { listeners.delete(listener); };
  }, [url]);

  if (!url) return 'gone';
  return cache.get(url) ?? 'checking';
}

/**
 * Real publication / update dates read off the live Yad2 ad page.
 * Shares the same batched probe as the liveness check, so no extra requests.
 */
export function useYad2AdDates(url: string | null | undefined): AdDates | null {
  const [, force] = useState(0);

  useEffect(() => {
    if (!url) return;
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    enqueue(url);
    return () => { listeners.delete(listener); };
  }, [url]);

  if (!url) return null;
  return dateCache.get(url) ?? null;
}
