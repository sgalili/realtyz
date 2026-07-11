// Poll Ayrshare Messages API and sync inbound Messenger / Instagram DMs
// into the `messages` table so /inbox stays populated even when Ayrshare's
// push webhook isn't reliably firing. Dedupes by ayrshare message id.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) {
      return new Response(JSON.stringify({ error: "AYRSHARE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) {
      return new Response(JSON.stringify({ error: "no_workspace_profile" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platforms: Array<"facebook" | "instagram"> = ["facebook", "instagram"];
    const summary: Record<string, any> = {};

    for (const platform of platforms) {
      const url = `${AYR_BASE}/messages?platform=${platform}&lastMessages=50`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
        },
      });
      const raw = await r.text();
      let json: any = null; try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
      if (!r.ok) {
        summary[platform] = { error: json?.message || raw.slice(0, 200), status: r.status };
        continue;
      }

      // Ayrshare Messages responses come in several shapes across accounts.
      // Normalize: support arrays of conversations with `messages`, or a flat
      // list of message objects.
      const conversations: any[] = Array.isArray(json?.conversations) ? json.conversations
        : Array.isArray(json?.messages) ? [{ messages: json.messages }]
        : Array.isArray(json) ? [{ messages: json }]
        : Array.isArray(json?.data) ? [{ messages: json.data }]
        : [];

      const inboxPlatform = platform === "instagram" ? "instagram" : "messenger";
      const psidCol = platform === "instagram" ? "instagram_psid" : "messenger_psid";
      let inserted = 0;
      let skipped = 0;

      for (const convo of conversations) {
        const msgs: any[] = Array.isArray(convo?.messages) ? convo.messages : [];
        for (const m of msgs) {
          const isEcho = Boolean(m.is_echo || m.echo || m.from_page || m.fromPage);
          if (isEcho) { skipped++; continue; }
          const senderId = String(
            m.senderId || m.sender_id || m.from?.id || m.psid || m.userId || convo.senderId || convo.psid || ""
          ).trim();
          const senderName = String(m.senderName || m.sender_name || m.from?.name || convo.senderName || "").trim();
          const text = String(m.message || m.text || m.content || "").trim();
          const msgId = String(m.id || m.messageId || m.mid || "").trim();
          if (!senderId || !text) { skipped++; continue; }

          // Dedupe by message id if present.
          if (msgId) {
            const { data: existing } = await admin
              .from("messages")
              .select("id")
              .eq("metadata->>ayrshare_message_id", msgId)
              .limit(1)
              .maybeSingle();
            if (existing) { skipped++; continue; }
          }

          // Find or create lead by PSID.
          let leadId: string | null = null;
          const { data: leadRow } = await admin
            .from("leads")
            .select("id")
            .eq(psidCol, senderId)
            .limit(1)
            .maybeSingle();
          if (leadRow?.id) leadId = leadRow.id;
          else {
            const { data: created, error: createErr } = await admin
              .from("leads")
              .insert({
                user_id: DEFAULT_OWNER_ID,
                full_name: senderName || `Messenger ${senderId.slice(-6)}`,
                [psidCol]: senderId,
                source: `${inboxPlatform}_dm`,
                lead_stage: "new",
              } as any)
              .select("id")
              .single();
            if (createErr) { console.error("[ayrshare-fetch-dms] lead create failed", createErr); skipped++; continue; }
            leadId = created?.id ?? null;
          }
          if (!leadId) { skipped++; continue; }

          const { error: insErr } = await admin.from("messages").insert({
            lead_id: leadId,
            content: text,
            direction: "inbound",
            sender_type: "voter",
            channel: inboxPlatform,
            platform: inboxPlatform,
            metadata: {
              ayrshare_message_id: msgId || null,
              sender_id: senderId,
              sender_name: senderName || null,
              source: "ayrshare-fetch-dms",
            },
          } as any);
          if (insErr) { console.error("[ayrshare-fetch-dms] msg insert failed", insErr); skipped++; continue; }
          inserted++;
        }
      }
      summary[platform] = { inserted, skipped, conversations: conversations.length };
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ayrshare-fetch-dms]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
