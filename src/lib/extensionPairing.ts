import { supabase } from '@/integrations/supabase/client';

/** Bridge between the app page and the Realtyz browser extension (content.js). */

export type ExtensionRunnerStatus = {
  paired: boolean;
  lastPollAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
};

const post = (payload: Record<string, unknown>) => {
  try {
    window.postMessage({ source: 'realtyz-app', ...payload }, window.location.origin);
  } catch {
    /* noop */
  }
};

/** Ask the extension for its posting-runner status. Resolves null when absent. */
export const readRunnerStatus = (timeoutMs = 1500): Promise<ExtensionRunnerStatus | null> =>
  new Promise((resolve) => {
    let done = false;
    const onMessage = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || d.source !== 'realtyz-extension' || d.type !== 'RZ_EXT_STATUS') return;
      done = true;
      window.removeEventListener('message', onMessage);
      const s = d.state || {};
      resolve({
        paired: !!d.paired,
        lastPollAt: s.last_poll_at ?? null,
        lastSuccessAt: s.last_success_at ?? null,
        lastError: s.last_error ?? null,
      });
    };
    window.addEventListener('message', onMessage);
    post({ type: 'RZ_EXT_STATUS_REQUEST' });
    window.setTimeout(() => {
      if (done) return;
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, timeoutMs);
  });

/** Mint a workspace sync key and hand it to the extension. */
export const pairExtension = async (): Promise<{ ok: boolean; reason?: string }> => {
  const { data, error } = await (supabase as any).rpc('ext_create_pairing', {
    _label: navigator.userAgent.slice(0, 120),
  });
  if (error) return { ok: false, reason: error.message };
  const token = (data as any)?.token;
  if (!token) return { ok: false, reason: 'לא הופק מפתח סנכרון' };

  post({ type: 'RZ_EXT_PAIR', token });
  await new Promise((r) => window.setTimeout(r, 900));
  const status = await readRunnerStatus();
  if (!status) return { ok: false, reason: 'התוסף לא זוהה בדפדפן — התקן והפעל אותו' };
  if (!status.paired) return { ok: false, reason: 'התוסף לא קיבל את מפתח הסנכרון' };
  return { ok: true };
};

/** Trigger an immediate queue poll inside the extension. */
export const pokeExtension = () => post({ type: 'RZ_EXT_POLL_NOW' });
