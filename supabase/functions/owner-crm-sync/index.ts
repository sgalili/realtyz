// owner-crm-sync
// Makes sure every property owner we scraped exists as a CRM profile card.
//
// For each listing with `source_metadata.owner_phone` / `owner_name`:
//   1. Normalise the phone to 9725XXXXXXXX.
//   2. Look the owner up in `crm_profiles` for that workspace (by phone, then name).
//   3. Create the profile card when missing, and link `listings.owner_id`.
//   4. Enrich with the official Meta WhatsApp Business (Cloud API) data:
//      number validation + profile picture, stored on `profile_picture_url`.
//
// Callable with { listing_id } (single, used right after import) or
// { limit } for a batch sweep / cron run.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH_VERSION = 'v21.0';
const BUDGET_MS = 110_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Israeli numbers are stored as 9725XXXXXXXX. */
function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) return d.length >= 11 ? d : null;
  if (d.startsWith('0')) return `972${d.slice(1)}`;
  if (d.length === 9) return `972${d}`;
  return d.length >= 10 ? d : null;
}

type WaCreds = { token: string; phoneNumberId: string } | null;

/** Official WhatsApp Business credentials: per-workspace first, env fallback. */
async function resolveWaCreds(admin: any, ownerUserId: string | null): Promise<WaCreds> {
  if (ownerUserId) {
    const { data } = await admin
      .from('wa_providers')
      .select('config, is_official, is_active')
      .eq('user_id', ownerUserId)
      .eq('is_official', true)
      .eq('is_active', true)
      .maybeSingle();
    const cfg = (data?.config ?? {}) as Record<string, any>;
    const token = cfg.access_token ?? cfg.token ?? cfg.permanent_token;
    const phoneNumberId = cfg.phone_number_id ?? cfg.phoneNumberId;
    if (token && phoneNumberId) return { token: String(token), phoneNumberId: String(phoneNumberId) };
  }
  const envToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? Deno.env.get('META_WHATSAPP_TOKEN');
  const envPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (envToken && envPhoneId) return { token: envToken, phoneNumberId: envPhoneId };
  return null;
}

type WaEnrichment = {
  checked: boolean;
  wa_id: string | null;
  profile_picture_url: string | null;
  error: string | null;
};

/**
 * Official Meta WhatsApp Business API enrichment.
 * `/{phone_number_id}/contacts` validates the number and returns the wa_id;
 * `/{wa_id}` returns the public business profile (incl. profile picture) when
 * the contact exposes one. Any Meta error is surfaced, never swallowed.
 */
async function enrichFromWhatsApp(creds: WaCreds, phone: string): Promise<WaEnrichment> {
  const out: WaEnrichment = { checked: false, wa_id: null, profile_picture_url: null, error: null };
  if (!creds) { out.error = 'whatsapp_credentials_missing'; return out; }
  out.checked = true;
  try {
    const contactsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/contacts`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocking: 'wait', contacts: [`+${phone}`], force_check: false }),
      },
    );
    const contactsBody = await contactsRes.text();
    if (!contactsRes.ok) {
      console.error(`[owner-crm-sync] contacts [${contactsRes.status}]: ${contactsBody.slice(0, 300)}`);
      out.error = `contacts_${contactsRes.status}`;
      return out;
    }
    const parsed = JSON.parse(contactsBody || '{}');
    const contact = parsed?.contacts?.[0];
    if (contact?.status && contact.status !== 'valid') { out.error = `contact_${contact.status}`; return out; }
    out.wa_id = contact?.wa_id ? String(contact.wa_id) : phone;

    const picRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${out.wa_id}?fields=profile_picture_url`,
      { headers: { Authorization: `Bearer ${creds.token}` } },
    );
    const picBody = await picRes.text();
    if (picRes.ok) {
      const pic = JSON.parse(picBody || '{}');
      out.profile_picture_url = pic?.profile_picture_url ? String(pic.profile_picture_url) : null;
    } else {
      console.warn(`[owner-crm-sync] profile picture [${picRes.status}]: ${picBody.slice(0, 200)}`);
    }
  } catch (e) {
    out.error = String((e as Error)?.message ?? e);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({} as any));
  const listingId: string | null = body?.listing_id ? String(body.listing_id) : null;
  const limit = Math.min(500, Math.max(1, Number(body?.limit) || 100));

  let q = admin
    .from('listings')
    .select('id, user_id, owner_id, city, neighborhood, source, source_url, source_metadata')
    .order('created_at', { ascending: false })
    .limit(listingId ? 1 : limit);
  if (listingId) q = q.eq('id', listingId);
  else q = q.is('owner_id', null);

  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const credsCache = new Map<string, WaCreds>();
  let scanned = 0, created = 0, linked = 0, enriched = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const row of rows ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    scanned++;
    const meta = (row.source_metadata ?? {}) as Record<string, any>;
    const homely = (meta.homely_raw ?? {}) as Record<string, any>;
    const phone = normalizePhone(meta.owner_phone ?? homely.tel1 ?? homely.tel2);
    const name = String(meta.owner_name ?? homely.name ?? '').trim();
    const email = String(meta.owner_email ?? homely.email ?? '').trim() || null;
    const workspace = row.user_id as string | null;

    if (!phone && !name) { skipped.push({ id: row.id, reason: 'no_owner_data' }); continue; }
    if (!workspace) { skipped.push({ id: row.id, reason: 'no_workspace' }); continue; }

    // 1. Existing profile?
    let profile: any = null;
    if (phone) {
      const { data } = await admin
        .from('crm_profiles')
        .select('id, full_name, phone, profile_picture_url, social_links, professional_info')
        .eq('workspace_owner_id', workspace)
        .eq('phone', phone)
        .maybeSingle();
      profile = data ?? null;
    }
    if (!profile && name) {
      const { data } = await admin
        .from('crm_profiles')
        .select('id, full_name, phone, profile_picture_url, social_links, professional_info')
        .eq('workspace_owner_id', workspace)
        .eq('full_name', name)
        .maybeSingle();
      profile = data ?? null;
    }

    // 2. WhatsApp enrichment (official Cloud API).
    let wa: WaEnrichment | null = null;
    if (phone && (!profile || !profile.profile_picture_url)) {
      if (!credsCache.has(workspace)) credsCache.set(workspace, await resolveWaCreds(admin, workspace));
      wa = await enrichFromWhatsApp(credsCache.get(workspace)!, phone);
      if (wa.profile_picture_url) enriched++;
    }

    const professional = {
      ...(profile?.professional_info ?? {}),
      role: 'property_owner',
      last_listing_id: row.id,
      last_listing_city: row.city ?? null,
      last_listing_neighborhood: row.neighborhood ?? null,
      source_url: row.source_url ?? meta.source_url ?? null,
    };
    const social = {
      ...(profile?.social_links ?? {}),
      ...(wa?.wa_id ? { whatsapp: `https://wa.me/${wa.wa_id}` } : phone ? { whatsapp: `https://wa.me/${phone}` } : {}),
    };

    // 3. Create or update the CRM card.
    if (!profile) {
      const { data: inserted, error: insErr } = await admin
        .from('crm_profiles')
        .insert({
          workspace_owner_id: workspace,
          full_name: name || `בעל נכס ${phone ?? ''}`.trim(),
          phone,
          email,
          profile_type: 'owner',
          source: row.source ?? 'listing_import',
          profile_picture_url: wa?.profile_picture_url ?? null,
          whatsapp_checked_at: wa?.checked ? new Date().toISOString() : null,
          social_links: social,
          professional_info: professional,
          enrichment_status: wa?.profile_picture_url ? 'enriched' : wa?.error ?? 'pending',
          enrichment_last_run_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (insErr) { skipped.push({ id: row.id, reason: insErr.message }); continue; }
      profile = inserted;
      created++;
    } else {
      await admin
        .from('crm_profiles')
        .update({
          full_name: profile.full_name || name || profile.full_name,
          phone: profile.phone ?? phone,
          profile_picture_url: profile.profile_picture_url ?? wa?.profile_picture_url ?? null,
          whatsapp_checked_at: wa?.checked ? new Date().toISOString() : undefined,
          social_links: social,
          professional_info: professional,
          enrichment_last_run_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
    }

    // 4. Link the listing to the owner card.
    if (profile?.id && row.owner_id !== profile.id) {
      const { error: linkErr } = await admin
        .from('listings')
        .update({ owner_id: profile.id })
        .eq('id', row.id);
      if (!linkErr) linked++;
    }
  }

  return json({
    ok: true,
    scanned,
    created,
    linked,
    enriched,
    skipped: skipped.slice(0, 20),
    duration_ms: Date.now() - started,
  });
});
