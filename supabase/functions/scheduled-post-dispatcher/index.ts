// Realtyz — Scheduled Post Dispatcher (JIT lazy-generator for recurring campaigns)
//
// Called by pg_cron every minute. Finds `campaign_logs` rows that were inserted
// as lightweight placeholders (status='scheduled', needs_regeneration=true) and
// whose `sent_at` is imminent. For each, it lazily generates the AI content
// (via generate-content) and dispatches it through meta-publish NOW. This lets
// the client insert hundreds of series slots instantly without pre-generating
// content or burning tokens up-front.
//
// Concurrency: rows are locked via `locked_at` + `locked_by` (SELECT ... FOR UPDATE
// SKIP LOCKED via a small RPC-style claim update) so parallel dispatcher runs
// never fire the same slot twice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FIRE_WINDOW_MS = 3 * 60_000; // fire slots whose sent_at is within +/- 3 min of now
const MAX_PER_RUN = 10;             // per-run cap to protect rate limits
const LOCK_TIMEOUT_MS = 5 * 60_000; // release orphaned locks after 5 min
const READY_WINDOW = 3;              // never prepare more than the next 3 versions in a series

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OFFICIAL_WA_NUMBER = "972537983832";
const OFFICIAL_WA_URL = `https://wa.me/${OFFICIAL_WA_NUMBER}`;

/** Every first comment must carry exactly one official WhatsApp link. */
function ensureWaLink(text: string | null | undefined): string {
  const base = String(text ?? "").trim();
  if (/wa\.me\/\d+|realtyz\.co\.il\/r\//i.test(base)) return base;
  const cta = `דברו איתי בוואטסאפ: ${OFFICIAL_WA_URL}`;
  return base ? `${base}\n\n${cta}` : cta;
}

/** Top the slot up to 10 random photos of its property. */
async function ensureMedia(admin: any, row: any): Promise<string[]> {
  const own = (Array.isArray(row.media_urls) ? row.media_urls : []).filter(
    (u: unknown) => typeof u === "string" && u.trim(),
  ) as string[];
  if (own.length >= 10 || !row.listing_id) return own.slice(0, 10);
  try {
    const { data } = await admin.rpc("listing_photo_pool", { _listing_id: row.listing_id });
    const pool = (Array.isArray(data) ? data : []).filter((u: unknown) => typeof u === "string" && u);
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return Array.from(new Set([...own, ...shuffled])).slice(0, 10);
  } catch {
    return own;
  }
}

async function invokeMetaPublish(row: any, body: string): Promise<{ ok: boolean; error?: string }> {

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE}`,
        "x-impersonate-user": String(row.user_id ?? ""),
      },
      body: JSON.stringify({
        post: body,
        channels: [row.channel],
        campaign_name: row.campaign_name,
        media_urls: Array.isArray(row.media_urls) ? row.media_urls : [],
        workspace_owner_id: row.workspace_owner_id ?? row.user_id,
        group_ids: Array.isArray(row.group_ids) ? row.group_ids : [],
        target_profile_key: row.target_profile_key ?? null,
        target_account_ref: row.target_account_ref ?? null,
        first_comment: ensureWaLink(row.first_comment),

        listing_id: row.listing_id ?? null,
        series_id: row.series_id ?? null,
        series_index: row.series_index ?? null,
        series_total: row.series_total ?? null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.success === false) {
      return { ok: false, error: payload?.message || payload?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function regenerateBody(row: any): Promise<string> {
  const fallback = String(row.message_body ?? "").trim();
  if (!row.listing_id || !row.regen_prompt) return fallback;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE}`,
        "x-impersonate-user": String(row.user_id ?? ""),
      },
      body: JSON.stringify({
        topic: "פוסט קידום נכס (וריאציה בסדרה מתוזמנת)",
        platform: row.channel,
        customInstructions: row.regen_prompt,
        selectedListingId: row.listing_id,
        listingFocusOnly: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const next = data?.content || data?.text || data?.body;
    const clean = typeof next === "string" ? next.trim() : "";
    return clean || fallback;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const workerId = `disp-${crypto.randomUUID().slice(0, 8)}-${Date.now()}`;
  const now = Date.now();

  // 1. Release orphaned locks (worker died mid-flight).
  await admin
    .from("campaign_logs")
    .update({ locked_at: null, locked_by: null })
    .eq("status", "scheduled")
    .lt("locked_at", new Date(now - LOCK_TIMEOUT_MS).toISOString());

  // 2. Find due placeholders.
  const dueBefore = new Date(now + FIRE_WINDOW_MS).toISOString();
  const { data: candidates, error: selErr } = await admin
    .from("campaign_logs")
    .select(
      "id, user_id, workspace_owner_id, campaign_name, channel, message_body, media_urls, group_ids, target_profile_key, target_account_ref, first_comment, listing_id, series_id, series_index, series_total, regen_prompt, sent_at",
    )
    .eq("status", "scheduled")
    .eq("needs_regeneration", true)
    .eq("is_archived", false)
    .is("locked_at", null)
    .lte("sent_at", dueBefore)
    .order("sent_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (selErr) {
    console.error("[scheduled-post-dispatcher] select error", selErr);
    return json({ ok: false, error: selErr.message }, 500);
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const row of candidates ?? []) {
    // Rolling-window rule: slot 0 may run immediately. Every later slot is
    // unlocked only after at least one earlier slot in the same series was
    // successfully sent. This prevents speculative AI generation for an
    // inactive series while keeping at most the next three versions eligible.
    if (row.series_id && Number(row.series_index ?? 0) > 0) {
      const { count: sentBefore } = await admin
        .from("campaign_logs")
        .select("id", { count: "exact", head: true })
        .eq("series_id", row.series_id)
        .eq("status", "sent")
        .lt("series_index", Number(row.series_index));
      if ((sentBefore ?? 0) < 1 || Number(row.series_index) > (sentBefore ?? 0) + READY_WINDOW) {
        results.push({ id: row.id, ok: false, error: "waiting_for_successful_previous_post" });
        continue;
      }
    }
    // Claim the row atomically — an UPDATE that only succeeds when the row
    // is still unlocked. Anyone else who reached this row already will fail
    // the WHERE clause and be skipped here.
    const { data: claimed, error: claimErr } = await admin
      .from("campaign_logs")
      .update({ locked_at: new Date().toISOString(), locked_by: workerId })
      .eq("id", row.id)
      .is("locked_at", null)
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) continue;

    const finalBody = await regenerateBody(row);
    const dispatch = await invokeMetaPublish(row, finalBody);

    if (dispatch.ok) {
      // meta-publish inserted its own row(s). Retire the placeholder so it
      // doesn't double-count on the calendar.
      await admin.from("campaign_logs").delete().eq("id", row.id);
      results.push({ id: row.id, ok: true });
    } else {
      // Release the lock so the next run can retry, and stamp the error.
      await admin
        .from("campaign_logs")
        .update({
          locked_at: null,
          locked_by: null,
          failure_reason: dispatch.error?.slice(0, 500) ?? "dispatch_failed",
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: dispatch.error });
    }
  }

  return json({ ok: true, worker: workerId, considered: candidates?.length ?? 0, results });
});
