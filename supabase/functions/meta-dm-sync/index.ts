// meta-dm-sync — poll Messenger + Instagram conversations straight from the
// Meta Graph API and mirror inbound DMs into public.messages.
// Safe to call on an interval; dedupes on the Meta message id.
//
// POST { platforms?: ["messenger","instagram"], limit?, user_id? }
//   → { ok: true, summary: { messenger: { inserted, skipped }, ... } }
//   → { ok: true, skipped: "page_not_connected", summary: {} } when no Page is linked
import { corsHeaders } from "../_shared/cors.ts";
import { metaAdminClient, resolveMetaPage, resolveTenant } from "../_shared/metaPage.ts";
import { type DmPlatform, fetchConversations, persistInboundDm } from "../_shared/metaDm.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const admin = metaAdminClient();
    const { ownerId } = await resolveTenant(admin, req, body);
    if (!ownerId) return json({ error: "unauthorized" }, 401);

    const page = await resolveMetaPage(admin, ownerId);
    if (!page) {
      // Normal state for WhatsApp-only workspaces: quiet no-op, never an error
      // the inbox would surface as a runtime failure.
      return json({ ok: true, skipped: "page_not_connected", summary: {} });
    }

    const requested: DmPlatform[] = Array.isArray(body?.platforms) && body.platforms.length > 0
      ? body.platforms
        .map((p: unknown) => (String(p).toLowerCase().startsWith("insta") ? "instagram" : "messenger"))
        .filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i) as DmPlatform[]
      : ["messenger", "instagram"];
    const limit = Math.min(Math.max(Number(body?.limit ?? 25) || 25, 1), 50);

    const summary: Record<string, any> = {};
    for (const platform of requested) {
      const { dms, error } = await fetchConversations(page, platform, limit);
      if (error) {
        summary[platform] = { error, inserted: 0, skipped: 0 };
        continue;
      }
      let inserted = 0;
      let skipped = 0;
      for (const dm of dms) {
        const r = await persistInboundDm(admin, ownerId, dm, "meta-dm-sync");
        if (r === "inserted") inserted++; else skipped++;
      }
      summary[platform] = { inserted, skipped, fetched: dms.length };
    }

    return json({ ok: true, summary });
  } catch (e) {
    console.error("[meta-dm-sync]", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
