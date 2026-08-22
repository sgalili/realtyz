import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WaAvatarJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number | null;
  scanned: number | null;
  updated: number | null;
  skipped: number | null;
  failed: number | null;
  last_error: string | null;
  force_refresh: boolean | null;
}

/**
 * Background WhatsApp avatar sync.
 *
 * The heavy lifting runs server-side inside the `fetch-wa-avatars` edge
 * function, so navigating away (or reloading) never cancels a sweep — this hook
 * simply re-attaches to the live job row and keeps reporting progress.
 */
export function useWaAvatarSync() {
  const [job, setJob] = useState<WaAvatarJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [supported, setSupported] = useState(true);
  const timer = useRef<number | null>(null);

  const readStatus = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('fetch-wa-avatars', {
        body: { action: 'status' },
      });
      const next = ((data as any)?.job ?? null) as WaAvatarJob | null;
      setJob(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    timer.current = window.setInterval(async () => {
      const next = await readStatus();
      if (!next || next.status === 'done' || next.status === 'failed') stopPolling();
    }, 3000);
  }, [readStatus, stopPolling]);

  // Re-attach to any sweep still running from an earlier visit.
  useEffect(() => {
    (async () => {
      const next = await readStatus();
      if (next && (next.status === 'queued' || next.status === 'running')) startPolling();
    })();
    return stopPolling;
  }, [readStatus, startPolling, stopPolling]);

  const start = useCallback(
    async (force = false) => {
      setStarting(true);
      try {
        const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', {
          body: { all: true, force },
        });
        const res = (data as any) ?? {};
        if (error || res.supported === false) {
          setSupported(false);
          return { supported: false as const };
        }
        setSupported(true);
        if (res.job) setJob(res.job as WaAvatarJob);
        startPolling();
        return { supported: true as const, reused: Boolean(res.reused) };
      } catch {
        setSupported(false);
        return { supported: false as const };
      } finally {
        setStarting(false);
      }
    },
    [startPolling],
  );

  const active = job?.status === 'queued' || job?.status === 'running';
  const total = job?.total ?? 0;
  const scanned = job?.scanned ?? 0;
  const percent = active && total > 0 ? Math.min(99, Math.round((scanned / total) * 100)) : job?.status === 'done' ? 100 : 0;

  return { job, active, percent, starting, supported, start, refresh: readStatus };
}
