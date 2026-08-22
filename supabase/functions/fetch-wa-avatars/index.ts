// fetch-wa-avatars
// ────────────────
// Hybrid WhatsApp architecture:
//   • Messaging + webhooks  → Meta Cloud API / Green API (per workspace mode).
//   • Contact avatars ONLY  → Green API (Meta exposes no contact-photo endpoint).
//
// Modes
//   { lead_ids: [...], force? }  → synchronous, small batch (profile cards).
//   { limit?, force? }           → synchronous sweep of missing avatars.
//   { all: true, force? }        → queues a background job that walks EVERY
//                                  lead with a phone number and keeps running
//                                  server-side after the browser navigates
//                                  away. Progress lives in
//                                  `wa_avatar_sync_jobs`.
//   { action: "status" }         → latest job for the caller's workspace.
//
// Every Green API call is wrapped so a missing/expired instance resolves with
// `supported: false` and the UI silently falls back to initials avatars.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchGreenAvatar,
  resolveGreenCreds,
  toIntlDigits,
  type GreenCreds,
} from "../_shared/greenApiCreds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const unsupported = (reason: string) =>
  json({
    success: true,
    supported: false,
    provider: "green-api",
    scanned: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    reasons: [],
    results: [],
    reason,
  });

const chatId = (phone: unknown): string | null => {
  const intl = toIntlDigits(phone);
  return intl ? `${intl}@c.us` : null;
};

/** Silent authorization probe — an unusable instance short-circuits the sweep. */
async function instanceAuthorized(creds: GreenCreds): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.green-api.com/waInstance${creds.instance_id}/getStateInstance/${creds.token}`,
    );
    const data: any = await res.json().catch(() => ({}));
    return res.ok && data?.stateInstance === "authorized";
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Background walker: pages through every lead with a phone number, pulling the
 * WhatsApp avatar one contact at a time and streaming progress into the job row
 * so the UI can reattach at any point (including after a full page reload).
 */
async function runJob(
  admin: any,
  creds: GreenCreds,
  jobId: string,
  force: boolean,
) {
  const PAGE = 500;
  const MAX_CONTACTS = 10_000;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const patch = (extra: Record<string, unknown> = {}) =>
    admin
      .from("wa_avatar_sync_jobs")
      .update({ scanned, updated, skipped, failed, ...extra })
      .eq("id", jobId)
      .then(() => {}, () => {});

  try {
    await admin
      .from("wa_avatar_sync_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // Snapshot the candidate list up front: rows leave the "missing avatar"
    // filter as we update them, so a live-paged query would skip contacts.
    const candidates: Array<{ id: string; phone_number: string | null }> = [];
    for (let offset = 0; offset < MAX_CONTACTS; offset += PAGE) {
      let query = admin
        .from("leads")
        .select("id, phone_number")
        .not("phone_number", "is", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (!force) query = query.is("profile_picture_url", null);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      const batch = (rows ?? []) as Array<{ id: string; phone_number: string | null }>;
      candidates.push(...batch);
      if (batch.length < PAGE) break;
    }

    await patch({ total: candidates.length });

    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      scanned++;
      const cid = chatId(row.phone_number);
      if (!cid) { skipped++; continue; }
      const url = await fetchGreenAvatar(creds, cid);
      if (!url) { failed++; continue; }
      const { error: upErr } = await admin
        .from("leads")
        .update({ profile_picture_url: url })
        .eq("id", row.id);
      if (upErr) failed++;
      else updated++;
      // Gentle pacing so Green API never rate-limits the sweep,
      // plus a progress heartbeat every 10 contacts.
      await sleep(250);
      if (scanned % 10 === 0) await patch();
    }

    await patch({ status: "done", finished_at: new Date().toISOString() });
  } catch (e) {
    await patch({
      status: "failed",
      last_error: e instanceof Error ? e.message : String(e),
      finished_at: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Caller identity (optional — service-role calls have none).
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (token) {
      const { data } = await admin.auth.getUser(token).catch(() => ({ data: { user: null } } as any));
      userId = (data as any)?.user?.id ?? null;
    }
    const ownerId: string | null = body?.owner_id ?? userId ?? null;

    // ── Job status probe ────────────────────────────────────────────────────
    if (body?.action === "status") {
      const { data } = await admin
        .from("wa_avatar_sync_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      return json({ success: true, job: (data ?? [])[0] ?? null });
    }

    const creds = await resolveGreenCreds(admin, ownerId);
    if (!creds) {
      return unsupported("שירות תמונות הפרופיל אינו מוגדר — מוצגות ראשי תיבות במקום");
    }
    if (!(await instanceAuthorized(creds))) {
      return unsupported("שירות תמונות הפרופיל אינו זמין כרגע — מוצגות ראשי תיבות במקום");
    }

    const force = body?.force === true;

    // ── Background full sweep ───────────────────────────────────────────────
    if (body?.all === true) {
      // Reuse a job that is already working so double clicks never duplicate.
      const { data: live } = await admin
        .from("wa_avatar_sync_jobs")
        .select("*")
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1);
      const running = (live ?? [])[0] as any;
      if (running) {
        return json({ success: true, supported: true, job: running, reused: true });
      }

      let totalQuery = admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("phone_number", "is", null);
      if (!force) totalQuery = totalQuery.is("profile_picture_url", null);
      const { count } = await totalQuery;

      const { data: job, error: jobErr } = await admin
        .from("wa_avatar_sync_jobs")
        .insert({
          workspace_owner_id: ownerId,
          started_by: userId,
          status: "queued",
          force_refresh: force,
          total: count ?? 0,
        })
        .select("*")
        .maybeSingle();
      if (jobErr || !job) {
        return unsupported("לא ניתן להתחיל סנכרון תמונות כעת");
      }

      const task = runJob(admin, creds, (job as any).id, force);
      // Keep the sweep alive after the HTTP response returns.
      // @ts-ignore Deno Deploy runtime API
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else {
        task.catch(() => {});
      }

      return json({ success: true, supported: true, job, queued: true });
    }

    // ── Synchronous small batch ─────────────────────────────────────────────
    const leadIds: string[] | undefined = Array.isArray(body?.lead_ids) ? body.lead_ids : undefined;
    const limit = Math.min(Number(body?.limit) || 50, 200);

    let query = admin
      .from("leads")
      .select("id, phone_number, profile_picture_url")
      .not("phone_number", "is", null)
      .limit(limit);
    if (leadIds?.length) query = query.in("id", leadIds);
    if (!force) query = query.is("profile_picture_url", null);

    const { data: rows, error } = await query;
    if (error) return unsupported("לא ניתן לטעון את רשימת אנשי הקשר כעת");

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of (rows ?? []) as Array<{ id: string; phone_number: string | null }>) {
      const cid = chatId(row.phone_number);
      if (!cid) { skipped++; continue; }
      const url = await fetchGreenAvatar(creds, cid);
      if (!url) { failed++; continue; }
      const { error: upErr } = await admin
        .from("leads")
        .update({ profile_picture_url: url })
        .eq("id", row.id);
      if (upErr) failed++;
      else updated++;
    }

    return json({
      success: true,
      supported: true,
      provider: "green-api",
      credential_source: creds.source,
      scanned: rows?.length ?? 0,
      updated,
      skipped,
      failed,
      errors: [],
      reasons: [],
      results: [],
    });
  } catch {
    return unsupported("שירות תמונות הפרופיל אינו זמין כרגע — מוצגות ראשי תיבות במקום");
  }
});
