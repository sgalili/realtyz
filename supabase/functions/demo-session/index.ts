// Super Admin-only view-only demo sign-in (also lets a demo session switch type): mints a session for the fixed demo account of the requested type.
// Demo accounts are write-blocked in the database (block_demo_viewer_writes) and in _shared/authz.ts.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { verifiedPhoneSession } from '../_shared/phoneSession.ts';

const Body = z.object({ type: z.enum(['broker', 'marketing', 'developer', 'owner', 'buyer', 'affiliate']) });
// Fictional QA series numbers (never allocated); marketing keeps its owner-approved number.
const ACCOUNTS: Record<z.infer<typeof Body>['type'], { phone: string; name: string; primary: string | null; role: string | null }> = {
  // Licensed-broker roles require a real registry license (enforce_official_broker_role), so the broker demo uses the partner role.
  broker: { phone: '972500000901', name: 'מתווך דמו', primary: 'partner', role: 'affiliate' },
  marketing: { phone: '972501234567', name: '', primary: null, role: null },
  developer: { phone: '972500000903', name: 'יזם דמו', primary: 'developer', role: 'developer' },
  owner: { phone: '972500000904', name: 'בעל נכס דמו', primary: 'property_owner', role: 'property_owner' },
  buyer: { phone: '972500000905', name: 'קונה דמו', primary: 'property_seeker', role: 'property_seeker' },
  affiliate: { phone: '972500000906', name: 'שותף דמו', primary: 'partner', role: 'affiliate' },
};
const hits = new Map<string, number[]>();
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) return json({ error: 'יותר מדי ניסיונות, נסו שוב בעוד דקה' }, 429);
  hits.set(ip, [...recent, now]);

  const url0 = Deno.env.get('SUPABASE_URL')!;
  const svc = createClient(url0, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = jwt ? await svc.auth.getUser(jwt) : { data: { user: null } };
  const uid = caller?.user?.id;
  if (!uid) return json({ error: 'הכניסה לדמו זמינה לסופר-אדמין בלבד' }, 401);
  const [{ data: sa }, { data: dv }] = await Promise.all([
    svc.from('user_roles').select('role').eq('user_id', uid).eq('role', 'super_admin').maybeSingle(),
    svc.from('demo_view_accounts').select('user_id').eq('user_id', uid).maybeSingle(),
  ]);
  if (!sa && !dv) return json({ error: 'הכניסה לדמו זמינה לסופר-אדמין בלבד' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'סוג דמו לא תקין' }, 400);
  const type = parsed.data.type;
  const cfg = ACCOUNTS[type];
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: existing } = await admin.from('demo_view_accounts').select('user_id').eq('demo_type', type).maybeSingle();
    if (!existing) {
      // First use: create the account, register it as view-only BEFORE issuing any session, then set its type.
      const first = await verifiedPhoneSession(admin, null, cfg.phone, 'demo_view');
      void first;
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = (list?.users ?? []).find((x: any) => String(x.phone ?? '').replace(/\D/g, '') === cfg.phone);
      if (!u) throw new Error('demo account missing');
      const { error: regErr } = await admin.from('demo_view_accounts').insert({ demo_type: type, user_id: u.id });
      if (regErr) throw regErr;
      await admin.from('profiles').upsert({ id: u.id, full_name: cfg.name, primary_user_type: cfg.primary, phone: `0${cfg.phone.slice(3)}`, workspace_owner_id: u.id });
      if (cfg.role) await admin.from('user_roles').upsert([{ user_id: u.id, role: 'user' }, { user_id: u.id, role: cfg.role }], { onConflict: 'user_id,role', ignoreDuplicates: true });
    }
    const session = await verifiedPhoneSession(admin, null, cfg.phone, 'demo_view');
    return json({ success: true, token_hash: session.token_hash, type });
  } catch (e) {
    console.error('demo-session failed', e instanceof Error ? e.message : e);
    return json({ error: 'לא ניתן לפתוח את הדמו כרגע' }, 500);
  }
});
