// Lazily verifies that Yad2 ad URLs still resolve to a live ad.
// Results are cached per-session so the table never re-probes the same URL.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AdStatus = 'live' | 'gone' | 'unknown' | 'checking';

export type AdDates = { published_at: string | null; updated_at: string | null };

const cache = new Map<string, AdStatus>();
const dateCache = new Map<string, AdDates>();

// Persisted across reloads so a previously verified ad renders its source link
// INSTANTLY on the next visit instead of waiting for a fresh probe.
const STORE_KEY = 'realtyz:yad2:adstatus';
type Persisted = Record<string, { status: AdStatus; dates?: AdDates; at: number }>;
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;

function readStore(): Persisted {
  try { return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}') as Persisted; }
  catch { return {}; }
}
function hydrate() {
  const store = readStore();
  const now = Date.now();
  for (const [url, entry] of Object.entries(store)) {
    if (!entry || now - entry.at > PERSIST_TTL_MS) continue;
    if (entry.status === 'live' || entry.status === 'gone') cache.set(url, entry.status);
    if (entry.dates) dateCache.set(url, entry.dates);
  }
}
function persist(url: string, status: AdStatus) {
  try {
    const store = readStore();
    store[url] = { status, dates: dateCache.get(url), at: Date.now() };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}
hydrate();
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
      persist(u, s);
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
