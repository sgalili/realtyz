// Webtiv → Homely background sync.
//
// Pulls live JSON from Webtiv "outJson.ashx" buyer + seller streams,
// dedups against our ledger (by serial + phone + email), and pushes new
// rows into Homely via the Open Card endpoint already used by
// `homely-push-lead`. Returns a per-broker summary and updates
// `webtiv_sync_state` so the dashboard can render status.
//
// Auth modes:
//   - Bearer JWT  → syncs only that user's configured streams.
//   - x-cron-secret matching CRON_SECRET env → syncs every broker with
//     `webtiv_sync_state.enabled = true`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HOMELY_URL = "https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost";
const STREAM_BASE = "https://webtivapi.webtiv.co.il/AutomaionJson/outJson.ashx";
const PROVIDER = "RealtyZ";

// Optional proxy gateway (Cloudflare Worker / similar) to bypass edge egress
// blocks against the Webtiv firewall. When set, every outbound Webtiv URL is
// rewritten to `${PROXY}?url=<encoded original url>`.
const WEBTIV_PROXY_URL = Deno.env.get("WEBTIV_PROXY_URL")?.replace(/\/+$/, "") || "";
function proxied(targetUrl: string): string {
  if (!WEBTIV_PROXY_URL) return targetUrl;
  const sep = WEBTIV_PROXY_URL.includes("?") ? "&" : "?";
  return `${WEBTIV_PROXY_URL}${sep}url=${encodeURIComponent(targetUrl)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: unknown): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return "0" + d.slice(3);
  if (d.startsWith("0")) return d;
  return d;
}

function firstPhone(rec: Record<string, unknown>): string {
  for (const k of ["tel1", "tel2", "tel3", "tel4", "tel5"]) {
    const v = normalizePhone(rec[k]);
    if (v && v.length >= 9) return v;
  }
  return "";
}

function strOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

async function fetchStream(guid: string): Promise<any[]> {
  try {
    const res = await fetch(proxied(`${STREAM_BASE}?guid=${encodeURIComponent(guid)}`), {
      headers: { "Accept": "application/json", "User-Agent": "Realtyz-Webtiv-Sync/1.0" },
    });
    if (!res.ok) return [];
    const arr = await res.json().catch(() => []);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function mapToHomelyPayload(
  rec: Record<string, any>,
  source: "buyers" | "sellers",
  client: string,
  defaultAgent?: string,
) {
  const category = source === "sellers" ? "מוכר" : "קונה";
  const phone = firstPhone(rec);
  const email = strOrUndef(rec.email);
  if (!phone && !email) return null;

  const name = strOrUndef(rec.name) ?? "—";
  const family = strOrUndef(rec.family) ?? "";

  const payload: Record<string, unknown> = {
    client,
    provider: PROVIDER,
    category,
    name,
    family,
    phone: phone || undefined,
    email,
    city: strOrUndef(rec.city ?? rec.city1),
    neighborhood: strOrUndef(rec.shcuna ?? rec.shcuna1),
    propertyType: strOrUndef(rec.objectresidence),
    rooms: strOrUndef(rec.room),
    floor: strOrUndef(rec.floor),
    builtsqmr: strOrUndef(rec.builtsqmr),
    price: strOrUndef(rec.priceshekel),
    street: source === "sellers" ? strOrUndef(rec.street) : undefined,
    number: source === "sellers" ? strOrUndef(rec.number) : undefined,
    remark: `Webtiv stream:${source} serial:${rec.serial ?? "?"} agent:${rec.agent ?? ""}`.trim(),
    agent: strOrUndef(rec.agent) ?? strOrUndef(defaultAgent),
    cardID: strOrUndef(rec.serial),
    mirpesetShemeshYN: rec.mirpesetShemeshYN === true || undefined,
    mamadYN: rec.mamadYN === true || undefined,
  };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  return { payload, phone, email: email ?? null };
}

// READ-ONLY ISOLATION: Homely / WebTiv are pull-only. We no longer POST any
// record to their API. The mapped payload is kept locally for reference only.
function pushToHomely(_payload: Record<string, unknown>) {
  return { ok: true, status: 0, parsed: { read_only: true } };
}


async function syncBroker(
  admin: ReturnType<typeof createClient>,
  state: { user_id: string; buyers_guid: string | null; sellers_guid: string | null; enabled: boolean },
): Promise<any> {
  const userId = state.user_id;
  const summary: any = {
    user_id: userId,
    buyers: { fetched: 0, inserted: 0, duplicates: 0, failed: 0 },
    sellers: { fetched: 0, inserted: 0, duplicates: 0, failed: 0 },
    errors: [] as string[],
  };

  // Load broker's Homely client code + default agent
  const { data: cred } = await admin
    .from("user_api_keys")
    .select("homely_client_code, homely_default_agent")
    .eq("user_id", userId)
    .maybeSingle();
  const client = (cred as any)?.homely_client_code;
  if (!client) {
    summary.errors.push("missing_homely_client_code");
    await admin.from("webtiv_sync_state").update({
      last_run_at: new Date().toISOString(),
      last_status: "failed",
      last_error: "missing_homely_client_code",
      last_summary: summary,
    }).eq("user_id", userId);
    return summary;
  }
  const defaultAgent = (cred as any)?.homely_default_agent;

  const sources: Array<{ key: "buyers" | "sellers"; guid: string | null }> = [
    { key: "buyers", guid: state.buyers_guid },
    { key: "sellers", guid: state.sellers_guid },
  ];

  for (const s of sources) {
    if (!s.guid) continue;
    const records = await fetchStream(s.guid);
    summary[s.key].fetched = records.length;

    for (const rec of records) {
      const serial = strOrUndef(rec.serial);
      if (!serial) continue;

      // Dedup by (user_id, source, serial)
      const { data: existsBySerial } = await admin
        .from("webtiv_synced_records")
        .select("id")
        .eq("user_id", userId).eq("source", s.key).eq("serial", serial)
        .maybeSingle();
      if (existsBySerial) { summary[s.key].duplicates++; continue; }

      const mapped = mapToHomelyPayload(rec, s.key, client, defaultAgent);
      if (!mapped) { summary[s.key].duplicates++; continue; }

      // Cross-source dedup by phone or email
      if (mapped.phone || mapped.email) {
        let q = admin.from("webtiv_synced_records").select("id").eq("user_id", userId);
        const ors: string[] = [];
        if (mapped.phone) ors.push(`phone.eq.${mapped.phone}`);
        if (mapped.email) ors.push(`email.eq.${mapped.email}`);
        if (ors.length) q = q.or(ors.join(","));
        const { data: dupContact } = await q.maybeSingle();
        if (dupContact) {
          summary[s.key].duplicates++;
          await admin.from("webtiv_synced_records").insert({
            user_id: userId, source: s.key, serial,
            phone: mapped.phone || null, email: mapped.email,
            homely_status: "duplicate_contact", raw: rec,
          });
          continue;
        }
      }

      const res = await pushToHomely(mapped.payload);
      const homelySerial = res.parsed?.serial != null ? String(res.parsed.serial) : null;

      // Auto-create a Realtyz CRM profile for every synced contact so
      // owners (sellers) and buyers get a personal card the moment they
      // arrive. Matches by phone first, then by name+workspace.
      try {
        const fullName = [strOrUndef((rec as any).name), strOrUndef((rec as any).family)]
          .filter(Boolean).join(" ").trim() || (mapped.phone ? `איש קשר ${mapped.phone.slice(-4)}` : "איש קשר");
        const profileType = s.key === "sellers" ? "Owner" : "Buyer";
        let existingId: string | null = null;
        if (mapped.phone) {
          const { data: byPhone } = await admin
            .from("crm_profiles").select("id")
            .eq("workspace_owner_id", userId).eq("phone", mapped.phone).maybeSingle();
          existingId = (byPhone as any)?.id ?? null;
        }
        if (!existingId) {
          const { data: byName } = await admin
            .from("crm_profiles").select("id")
            .eq("workspace_owner_id", userId).ilike("full_name", fullName).maybeSingle();
          existingId = (byName as any)?.id ?? null;
        }
        const professional_info = {
          city: strOrUndef((rec as any).city ?? (rec as any).city1),
          neighborhood: strOrUndef((rec as any).shcuna ?? (rec as any).shcuna1),
          propertyType: strOrUndef((rec as any).objectresidence),
          rooms: strOrUndef((rec as any).room),
          price: strOrUndef((rec as any).priceshekel),
          deal_side: s.key,
        };
        if (existingId) {
          await admin.from("crm_profiles").update({
            phone: mapped.phone || undefined,
            email: mapped.email ?? undefined,
            professional_info,
          }).eq("id", existingId);
        } else {
          await admin.from("crm_profiles").insert({
            workspace_owner_id: userId,
            full_name: fullName,
            phone: mapped.phone || null,
            email: mapped.email,
            profile_type: profileType,
            source: "webtiv_import",
            professional_info,
          });
        }
      } catch (e) {
        console.warn("[webtiv-homely-sync] crm_profiles upsert failed", (e as Error).message);
      }

      await admin.from("webtiv_synced_records").insert({
        user_id: userId,
        source: s.key,
        serial,
        phone: mapped.phone || null,
        email: mapped.email,
        homely_status: res.ok ? "success" : `failed_${res.status}`,
        homely_serial: homelySerial,
        raw: rec,
      });

      if (res.ok) summary[s.key].inserted++;
      else {
        summary[s.key].failed++;
        summary.errors.push(`${s.key}#${serial}:${res.status}`);
        await logIntegrationError({
          integration: "homely",
          functionName: "webtiv-homely-sync",
          errorCode: res.status,
          errorMessage: JSON.stringify(res.parsed).slice(0, 500),
          context: { user_id: userId, source: s.key, serial },
        });
      }
    }
  }

  const status = summary.errors.length === 0 ? "ok" : (summary.buyers.inserted + summary.sellers.inserted > 0 ? "partial" : "failed");
  await admin.from("webtiv_sync_state").update({
    last_run_at: new Date().toISOString(),
    last_status: status,
    last_error: summary.errors.length ? summary.errors.slice(0, 10).join(" | ") : null,
    last_summary: summary,
  }).eq("user_id", userId);

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCron = Deno.env.get("CRON_SECRET");
    const isCron = !!(cronSecret && expectedCron && cronSecret === expectedCron);

    let targetUserId: string | null = null;
    if (!isCron) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      targetUserId = user.id;

      // Ensure a state row exists (with defaults from request body, if provided)
      const body = await req.json().catch(() => ({}));
      const buyersGuid = (body as any)?.buyers_guid as string | undefined;
      const sellersGuid = (body as any)?.sellers_guid as string | undefined;

      const { data: existing } = await admin
        .from("webtiv_sync_state").select("*").eq("user_id", user.id).maybeSingle();
      if (!existing) {
        await admin.from("webtiv_sync_state").insert({
          user_id: user.id,
          buyers_guid: buyersGuid ?? "b6bb7f44-571b-4551-8de9-e075b8a89128",
          sellers_guid: sellersGuid ?? "32dc79a4-88ba-49a4-816e-f1fc43024c2f",
          enabled: true,
        });
      } else if (buyersGuid || sellersGuid) {
        await admin.from("webtiv_sync_state").update({
          buyers_guid: buyersGuid ?? existing.buyers_guid,
          sellers_guid: sellersGuid ?? existing.sellers_guid,
        }).eq("user_id", user.id);
      }
    }

    let query = admin.from("webtiv_sync_state").select("user_id, buyers_guid, sellers_guid, enabled");
    if (!isCron && targetUserId) query = query.eq("user_id", targetUserId);
    else query = query.eq("enabled", true);
    const { data: states, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const st of (states || [])) results.push(await syncBroker(admin, st as any));

    return json({ ok: true, mode: isCron ? "cron" : "manual", brokers_processed: results.length, results });
  } catch (e) {
    console.error("[webtiv-homely-sync] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
