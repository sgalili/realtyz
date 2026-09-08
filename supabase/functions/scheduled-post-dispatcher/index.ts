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
import { enforceSingleEmojis, ensureLeadingEmojiBullets, EMOJI_BULLET_LAW, RICH_TEMPLATE_CONTRACT } from "../_shared/emoji.ts";
import { ensureMandatoryComment } from "../_shared/mandatoryComment.ts";

// HARD posting window: nothing is ever published before 09:00 or after 21:00.
const WINDOW_START_MIN = 9 * 60;
const WINDOW_END_MIN = 21 * 60;

/** True when a moment falls inside the allowed 09:00-21:00 window. */
function insideWindow(d: Date): boolean {
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= WINDOW_START_MIN && min <= WINDOW_END_MIN;
}

/** Moves a moment to a random time inside the next allowed window. */
function moveIntoWindow(d: Date): Date {
  const out = new Date(d);
  const min = out.getHours() * 60 + out.getMinutes();
  if (min > WINDOW_END_MIN) out.setDate(out.getDate() + 1);
  const target = WINDOW_START_MIN + Math.floor(Math.random() * 90);
  out.setHours(Math.floor(target / 60), target % 60, Math.floor(Math.random() * 60), 0);
  return out;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FIRE_WINDOW_MS = 3 * 60_000; // fire slots whose sent_at is within +/- 3 min of now
const MAX_PER_RUN = 10;             // per-run cap to protect rate limits
const LOCK_TIMEOUT_MS = 5 * 60_000; // release orphaned locks after 5 min
const READY_WINDOW = 1;              // only ONE future version of a series is ever queued
// A property in any of these states stops its whole campaign series.
const STOPPED_LISTING_STATUSES = ["hold", "sold", "rented", "disabled", "discarded"];

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
        first_comment: ensureMandatoryComment(row.first_comment),
        publish_to_page: (row?.provider_response ?? {})?.publish_to_page !== false,

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
        customInstructions: `${row.regen_prompt}\n\n${RICH_TEMPLATE_CONTRACT}\n\n${EMOJI_BULLET_LAW}`,
        selectedListingId: row.listing_id,
        listingFocusOnly: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const next = data?.content || data?.text || data?.body;
    const clean = typeof next === "string" ? next.trim() : "";
    return ensureLeadingEmojiBullets(enforceSingleEmojis(clean || fallback));
  } catch {
    return fallback;
  }
}


/** Next occurrence date for a recurrence rule, starting from `from`. */
function nextOccurrence(from: Date, rule: any): Date | null {
  const pattern = String(rule?.pattern ?? "");
  const d = new Date(from);
  if (pattern === "daily") { d.setDate(d.getDate() + 1); return d; }
  if (pattern === "weekly") { d.setDate(d.getDate() + 7); return d; }
  if (pattern === "monthly") { d.setMonth(d.getMonth() + 1); return d; }
  if (pattern === "custom") {
    const days: number[] = Array.isArray(rule?.days) ? rule.days.map(Number) : [];
    if (days.length === 0) return null;
    for (let i = 1; i <= 14; i++) {
      const c = new Date(from);
      c.setDate(c.getDate() + i);
      if (days.includes(c.getDay())) return c;
    }
    return null;
  }
  return null;
}

/** Random minute inside the rule's daily window. */
function applyWindow(day: Date, rule: any): Date {
  const parse = (v: unknown, fallback: number) => {
    const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
  };
  // Never allow a rule to push a post outside the hard 09:00-21:00 window.
  const startMin = Math.max(WINDOW_START_MIN, parse(rule?.win_start, WINDOW_START_MIN));
  const endMin = Math.min(WINDOW_END_MIN, Math.max(startMin + 30, parse(rule?.win_end, WINDOW_END_MIN)));
  const minute = startMin + Math.floor(Math.random() * Math.max(1, endMin - startMin));
  const out = new Date(day);
  out.setHours(Math.floor(minute / 60), minute % 60, Math.floor(Math.random() * 60), 0);
  return out;
}

/**
 * Creates the single next version of an endless series after a successful
 * publish. Bails out when the series already has a future slot, when there is
 * no recurrence rule, or when the property is no longer active.
 */
async function enqueueNextVersion(admin: any, row: any): Promise<void> {
  try {
    const rule = row.recurrence_rule;
    if (!rule || !row.series_id) return;

    const { count: futureCount } = await admin
      .from("campaign_logs")
      .select("id", { count: "exact", head: true })
      .eq("series_id", row.series_id)
      .eq("status", "scheduled")
      .gt("sent_at", new Date().toISOString());
    if ((futureCount ?? 0) >= READY_WINDOW) return;

    if (row.listing_id) {
      const { data: listing } = await admin
        .from("listings")
        .select("status")
        .eq("id", row.listing_id)
        .maybeSingle();
      if (listing && STOPPED_LISTING_STATUSES.includes(String(listing.status))) return;
    }

    const day = nextOccurrence(new Date(row.sent_at ?? Date.now()), rule);
    if (!day) return;
    const when = applyWindow(day, rule);
    if (when.getTime() <= Date.now()) return;

    const nextIndex = Number(row.series_index ?? 0) + 1;
    await admin.from("campaign_logs").insert({
      user_id: row.user_id,
      workspace_owner_id: row.workspace_owner_id ?? row.user_id,
      campaign_name: row.campaign_name,
      channel: row.channel,
      message_body: row.message_body,
      status: "scheduled",
      sent_at: when.toISOString(),
      source_account: "meta-placeholder",
      needs_regeneration: true,
      regen_prompt: row.regen_prompt,
      listing_id: row.listing_id ?? null,
      first_comment: ensureMandatoryComment(row.first_comment),
      media_urls: Array.isArray(row.media_urls) ? row.media_urls : [],
      group_ids: Array.isArray(row.group_ids) ? row.group_ids : [],
      target_profile_key: row.target_profile_key ?? null,
      target_account_ref: row.target_account_ref ?? null,
      provider_response: { publish_to_page: (row?.provider_response ?? {})?.publish_to_page !== false },
      series_id: row.series_id,
      series_index: nextIndex,
      series_total: nextIndex + 1,
      recurrence_rule: rule,
    });
  } catch (e) {
    console.error("[scheduled-post-dispatcher] enqueueNextVersion failed", e);
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
      "id, user_id, workspace_owner_id, campaign_name, channel, message_body, media_urls, group_ids, target_profile_key, target_account_ref, first_comment, listing_id, series_id, series_index, series_total, regen_prompt, sent_at, recurrence_rule, provider_response",
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
    // HARD posting window: never publish before 09:00 or after 21:00. Slots
    // that drifted outside the window are pushed into the next window.
    const slotWhen = new Date(row.sent_at ?? Date.now());
    if (!insideWindow(slotWhen)) {
      const moved = moveIntoWindow(slotWhen);
      await admin
        .from("campaign_logs")
        .update({ sent_at: moved.toISOString(), locked_at: null, locked_by: null })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error: "outside_posting_window_rescheduled" });
      continue;
    }
    // Hard stop: a property on hold / sold / rented / disabled must never post
    // again. Drop the slot (and any sibling future slot) instead of firing it.
    if (row.listing_id) {
      const { data: listing } = await admin
        .from("listings")
        .select("status")
        .eq("id", row.listing_id)
        .maybeSingle();
      if (listing && STOPPED_LISTING_STATUSES.includes(String(listing.status))) {
        await admin.rpc("cancel_future_listing_posts", { _listing_id: row.listing_id });
        results.push({ id: row.id, ok: false, error: `listing_${listing.status}` });
        continue;
      }
    }
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
    // Guarantee up to 10 random property photos on every dispatched slot.
    row.media_urls = await ensureMedia(admin, row);
    const dispatch = await invokeMetaPublish(row, finalBody);


    if (dispatch.ok) {
      // meta-publish inserted its own row(s). Retire the placeholder so it
      // doesn't double-count on the calendar.
      await admin.from("campaign_logs").delete().eq("id", row.id);
      // Endless rolling repeat: now that this version went out, materialize the
      // NEXT single version. Never more than one future slot per series.
      await enqueueNextVersion(admin, row);
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
