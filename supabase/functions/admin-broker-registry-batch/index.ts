import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin, requireCaller } from '../_shared/authz.ts';
import { runRegistryBatchStep } from '../_shared/brokerRegistryBatchRunner.ts';
import { brokerUserError } from '../_shared/brokerRecovery.ts';
const Body = z.discriminatedUnion('action', [z.object({ action: z.literal('status') }).strict(), z.object({ action: z.literal('start'), confirmed: z.literal(true) }).strict(), z.object({ action: z.literal('cancel'), batch_id: z.string().uuid(), confirmed: z.literal(true) }).strict(), z.object({ action: z.literal('step'), batch_id: z.string().uuid() }).strict()]);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'פעולה לא נתמכת' }, 405);
  const caller = await requireCaller(req, ['user', 'cron', 'service']);
  if (caller instanceof Response) return caller;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: 'פרטי הפעולה אינם תקינים' }, 400);
  const input = body.data; const admin = adminClient();
  if (input.action === 'step') {
    if (caller.kind === 'user') return json({ error: 'אין הרשאה לפעולה' }, 403);
  } else if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId, admin)) return json({ error: 'אין הרשאה לפעולה' }, 403);
  try {
    if (input.action === 'step') return json(await runRegistryBatchStep(admin, input.batch_id));
    if (caller.kind !== 'user') return json({ error: 'אין הרשאה לפעולה' }, 403);
    let id: string | null = null;
    if (input.action === 'start') {
      // Reuse the exact authorized full waiting-list projection, independent of browser filters.
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/admin-broker-contact`, { method: 'POST', headers: { Authorization: `Bearer ${caller.token}`, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) });
      const list = await response.json();
      if (!response.ok || !Array.isArray(list.brokers)) throw new Error('לא ניתן לקרוא את רשימת המתווכים');
      const targets = list.brokers.filter((r: { is_developer?: boolean; license_verified?: boolean }) => !r.is_developer && !r.license_verified).map((r: { user_id: string }) => r.user_id);
      const result = await admin.rpc('start_broker_registry_batch', { _actor: caller.userId, _targets: targets });
      if (result.error) throw result.error; id = result.data;
    }
    if (input.action === 'cancel') {
      const result = await admin.rpc('cancel_broker_registry_batch', { _id: input.batch_id, _actor: caller.userId });
      if (result.error) throw result.error; id = input.batch_id;
    }
    const result = await admin.rpc('get_broker_registry_batch', { _id: id });
    if (result.error) throw result.error;
    return json({ batch: result.data });
  } catch (error) {
    console.error('[broker-registry-batch]', { action: input.action, code: (error as { code?: string }).code });
    return json({ error: brokerUserError(error, 'פעולת האימות לא הושלמה. נסו שוב בעוד רגע.') }, 503);
  }
});
