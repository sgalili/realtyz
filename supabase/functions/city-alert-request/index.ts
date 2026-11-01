import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { sendWhatsApp } from '../_shared/engagementJobs.ts';

// Rita's official WhatsApp Business number sends only this purpose-specific approved template.
const RITA_WORKSPACE_OWNER_ID = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
const TEMPLATE_NAME = 'city_alert_confirmation';

const Body = z.object({
  phone: z.string().trim().min(9).max(20),
  city: z.string().trim().max(80).optional(),
  preferences: z.record(z.unknown()).default({}),
  consent: z.literal(true),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return /^9725\d{8}$/.test(d) ? d : null;
}

function summarize(p: Record<string, unknown>): string {
  const parts: string[] = [];
  const deal = p.deal === 'sale' ? 'למכירה' : p.deal === 'rent' ? 'להשכרה' : '';
  if (deal) parts.push(deal);
  if (typeof p.propertyType === 'string' && p.propertyType !== 'all') parts.push(p.propertyType);
  if (typeof p.priceMin === 'number' || typeof p.priceMax === 'number') parts.push(`מחיר ${p.priceMin ?? 0}-${p.priceMax ?? 'ללא הגבלה'} ₪`);
  if (typeof p.roomsMin === 'number') parts.push(`מ-${p.roomsMin} חדרים`);
  return (parts.join(', ') || 'כל הנכסים').slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return json({ error: 'מספר וואטסאפ לא תקין' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    let userId: string | null = null;
    const auth = req.headers.get('Authorization');
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }
    const city = parsed.data.city || null;
    const { data: row, error } = await admin.from('city_alert_requests')
      .insert({ phone, requested_city: city, preferences: parsed.data.preferences, user_id: userId })
      .select('id').single();
    if (error) {
      if (error.code === '23505') return json({ ok: true, duplicate: true });
      throw error;
    }

    const { data: template } = await admin.from('wa_message_templates').select('name,language,variable_count,has_header_variable')
      .eq('owner_user_id', RITA_WORKSPACE_OWNER_ID).eq('name', TEMPLATE_NAME).eq('status', 'APPROVED').maybeSingle();
    if (!template || template.has_header_variable || template.variable_count !== 2) {
      await admin.from('city_alert_requests').update({ status: 'needs_template' }).eq('id', row.id);
      return json({ ok: true, sent: false });
    }
    const result = await sendWhatsApp({
      phone_number: phone, tenant_id: RITA_WORKSPACE_OWNER_ID, force_official: true,
      template_id: template.name, template_language: template.language,
      template_components: [{ type: 'body', parameters: [
        { type: 'text', text: city || 'העיר שלך' },
        { type: 'text', text: summarize(parsed.data.preferences) },
      ] }],
    });
    let accepted = false;
    try { accepted = result.ok && JSON.parse(result.body).success === true; } catch { accepted = false; }
    if (!accepted) console.error(`city alert send failed [${result.status}]: ${result.body}`);
    await admin.from('city_alert_requests').update({ status: accepted ? 'sent' : 'failed', error: accepted ? null : `WhatsApp ${result.status}` }).eq('id', row.id);
    return json({ ok: true, sent: accepted });
  } catch (e) {
    console.error('city-alert-request error', e);
    return json({ error: 'שגיאה בשמירת הבקשה' }, 500);
  }
});
