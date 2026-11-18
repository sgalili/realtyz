// View-only demo inside the real app screens. The server is the source of truth:
// demo accounts are listed in demo_view_accounts and every write they make is skipped.
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DemoType } from '@/pages/demo/demoData';

export const DEMO_HOME: Record<DemoType, string> = {
  broker: '/',
  marketing: '/our-clients',
  developer: '/developer-dashboard',
  owner: '/my-ads',
  buyer: '/',
  affiliate: '/affiliate',
};

export const DEMO_BLOCKED_MESSAGE = 'זמין בחשבון לייב. במצב דמו אפשר רק לצפות';

/** Server mints a session for the fixed view-only demo account of this type. */
export async function startDemoSession(type: DemoType): Promise<void> {
  const { data, error } = await supabase.functions.invoke('demo-session', { body: { type } });
  if (error || !data?.token_hash) throw new Error(data?.error || 'לא ניתן לפתוח את הדמו כרגע');
  await supabase.auth.signOut().catch(() => undefined);
  const res = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (res.error) throw res.error;
}

// Functions that only read and are safe to call in demo (the server rejects the rest anyway).
const READ_FUNCTIONS = new Set(['demo-session']);
let installed = false;
let original: { from: typeof supabase.from; invoke: typeof supabase.functions.invoke } | null = null;

const blockedResult = () => ({ data: null, error: { message: DEMO_BLOCKED_MESSAGE, code: 'demo_view_only' }, count: null, status: 403, statusText: 'demo' });

/** Chainable thenable: any further builder call returns itself and resolves to a blocked result. */
function blockedBuilder(): unknown {
  let notified = false;
  const target = function () { /* callable proxy target */ };
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') {
        if (!notified) { notified = true; toast.info(DEMO_BLOCKED_MESSAGE); }
        const p = Promise.resolve(blockedResult());
        return p.then.bind(p);
      }
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

export function installDemoWriteGuard() {
  if (installed) return;
  installed = true;
  original = { from: supabase.from.bind(supabase), invoke: supabase.functions.invoke.bind(supabase.functions) };
  const from = original.from;
  (supabase as unknown as { from: unknown }).from = (table: string) => {
    const qb = from(table as never) as unknown as Record<string, unknown>;
    for (const m of ['insert', 'update', 'upsert', 'delete']) qb[m] = () => blockedBuilder();
    return qb;
  };
  const invoke = original.invoke;
  (supabase.functions as unknown as { invoke: unknown }).invoke = (name: string, opts?: unknown) => {
    if (READ_FUNCTIONS.has(name)) return invoke(name, opts as never);
    return blockedBuilder();
  };
}

export function removeDemoWriteGuard() {
  if (!installed || !original) return;
  (supabase as unknown as { from: unknown }).from = original.from;
  (supabase.functions as unknown as { invoke: unknown }).invoke = original.invoke;
  installed = false;
  original = null;
}
