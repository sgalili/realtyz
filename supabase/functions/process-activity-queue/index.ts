// process-activity-queue
// Cron-invoked drip dispatcher for the campaign_activity_queue Time Bank.
//
// Rules:
//   • Pop ONE pending row per workspace per tick (max 1 group post every
//     15-30 min per workspace).
//   • Apply variation spinner: pick variations[variation_index ?? round-robin]
//     and merge title/body into payload.outbound_text.
//   • Always re-append the canonical broker footer via enforceOwnerLaws —
//     compliance footer is locked regardless of spun variant.
//   • For manual_share rows, flip status → 'ready' so the UI can unlock the
//     next group. For ayrshare_post / fb_group_post / messenger, mark
//     'completed' (the actual API push is handled by the caller / Ayrshare).
//
// Safe to invoke every 5-10 minutes by pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enforceOwnerLaws } from "../_shared/owner-laws.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Per-workspace cool-down between drips (minutes). Real spacing is also
// guaranteed by the +1..7 min jitter applied at staging time.
const COOLDOWN_MIN = 15;
const COOLDOWN_MAX = 30;

function pickVariationIndex(row: any): number {
  const variants: any[] = Array.isArray(row?.variations) ? row.variations : [];
  if (variants.length === 0) return 0;
  // Round-robin by attempts, with a randomized tiebreaker so two workspaces
  // hitting the same row count don't end up perfectly aligned.
  const base = (row.attempts ?? 0) % variants.length;
  const jitter = Math.random() < 0.34 ? (base + 1) % variants.length : base;
  return jitter;
}

function applyVariation(row: any): { title: string; body: string } {
  const variants: any[] = Array.isArray(row?.variations) ? row.variations : [];
  const idx = typeof row.variation_index === "number"
    ? Math.max(0, Math.min(variants.length - 1, row.variation_index))
    : pickVariationIndex(row);
  const v = variants[idx] ?? {};
  const title = String(v?.title ?? row?.payload?.title ?? "").trim();
  const body = String(v?.body ?? row?.payload?.body ?? row?.payload?.text ?? "").trim();
  return { title, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  // Pull a small batch of due items across workspaces.
  const { data: due, error } = await admin
    .from("campaign_activity_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(25);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const processedWorkspaces = new Set<string>();
  const results: any[] = [];

  for (const row of due ?? []) {
    // Enforce per-workspace cool-down: only one drip per workspace per tick.
    if (processedWorkspaces.has(row.workspace_owner_id)) continue;

    // Lock the row.
    const { data: locked, error: lockErr } = await admin
      .from("campaign_activity_queue")
      .update({ status: "processing", processed_at: now, attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (lockErr || !locked) continue;

    try {
      const { title, body } = applyVariation(locked);
      const merged = [title, body].filter(Boolean).join("\n\n");
      const compliant = enforceOwnerLaws(merged, { withLicense: true });

      const newPayload = {
        ...(locked.payload ?? {}),
        outbound_text: compliant,
        chosen_title: title,
        chosen_body: body,
      };

      const isManual =
        locked.activity_type === "manual_share" ||
        locked.activity_type === "fb_group_post"; // groups also go via manual paste
      const nextStatus = isManual ? "ready" : "completed";
      const nextPublication = isManual
        ? "ready_awaiting_whatsapp_auth"
        : "published";

      await admin
        .from("campaign_activity_queue")
        .update({
          status: nextStatus,
          publication_status: nextPublication,
          payload: newPayload,
          variation_index:
            typeof locked.variation_index === "number"
              ? locked.variation_index
              : pickVariationIndex(locked),
          completed_at: nextStatus === "completed" ? now : null,
        })
        .eq("id", locked.id);

      // Fire WhatsApp confirmation alert to the workspace owner the moment
      // a manual-share slot unlocks. Best-effort: failures must NOT abort
      // the dispatch loop.
      if (isManual) {
        try {
          const { data: ownerProfile } = await admin
            .from("profiles")
            .select("phone, full_name")
            .eq("id", locked.workspace_owner_id)
            .maybeSingle();
          const ownerPhone = String(ownerProfile?.phone ?? "").trim();
          if (ownerPhone) {
            const appUrl =
              Deno.env.get("APP_URL")?.replace(/\/+$/, "") ||
              "https://realtyz.udiman.com";
            const groupName = String(locked.target_label ?? "קבוצה").trim();
            const confirmUrl =
              `${appUrl}/campaigns?tab=create&action=confirm&queue_id=${locked.id}`;
            const message =
              `📢 פוסט חדש מוכן לפרסום בקבוצה: ${groupName}!\n\n` +
              `הטקסט עבר התאמת AI ייחודית ומוכן להעתקה.\n\n` +
              `לאישור ומעבר מהיר לקבוצה לחץ כאן: ${confirmUrl}`;
            await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
              },
              body: JSON.stringify({
                phone_number: ownerPhone,
                message,
                tenant_id: locked.workspace_owner_id,
              }),
            });
            await admin
              .from("campaign_activity_queue")
              .update({ owner_notified_at: new Date().toISOString() })
              .eq("id", locked.id);
          }
        } catch (notifyErr) {
          console.error("owner WhatsApp notify failed:", notifyErr);
        }
      }


      // Push remaining pending rows for this workspace forward by cooldown.
      const cool = COOLDOWN_MIN + Math.floor(Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN + 1));
      const nextAt = new Date(Date.now() + cool * 60_000).toISOString();
      await admin
        .from("campaign_activity_queue")
        .update({ scheduled_for: nextAt })
        .eq("workspace_owner_id", locked.workspace_owner_id)
        .eq("status", "pending")
        .lt("scheduled_for", nextAt);

      processedWorkspaces.add(locked.workspace_owner_id);
      results.push({ id: locked.id, status: nextStatus, cooldown_min: cool });
    } catch (e: any) {
      await admin
        .from("campaign_activity_queue")
        .update({ status: "failed", last_error: String(e?.message ?? e) })
        .eq("id", locked.id);
      results.push({ id: locked.id, status: "failed", error: String(e?.message ?? e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, drained: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
