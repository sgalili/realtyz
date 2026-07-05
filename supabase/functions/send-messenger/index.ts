// send-messenger — outbound reply to a Facebook Page conversation.
// Body: { lead_id?, page_id?, psid?, message, ai_assisted? }
// Uses the Page access token stored in messenger_page_bindings for Udi's workspace.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { appendDisclosure } from "../_shared/compliance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GRAPH = "https://graph.facebook.com/v20.0";

const Body = z.object({
  lead_id: z.string().uuid().optional(),
  page_id: z.string().min(1).optional(),
  psid: z.string().min(1).optional(),
  message: z.string().min(1).max(2000),
  ai_assisted: z.boolean().optional(),
}).refine((v) => (!!v.psid && !!v.page_id) || !!v.lead_id, {
  message: "Provide lead_id, or both page_id and psid",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

  // Auth — restrict to Udi's workspace.
  let userId: string | null = null;
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer && bearer !== SERVICE_ROLE) {
    const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data } = await uc.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (userId && userId !== OWNER_ID) {
    return json({ error: "messenger provider not enabled for this workspace" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Resolve page_id + psid from lead's last inbound Messenger message when not provided.
  let pageId = parsed.data.page_id ?? null;
  let psid = parsed.data.psid ?? null;
  if ((!pageId || !psid) && parsed.data.lead_id) {
    const { data: last } = await admin
      .from("messages")
      .select("metadata")
      .eq("lead_id", parsed.data.lead_id)
      .eq("platform", "messenger")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const md = (last as any)?.metadata ?? {};
    pageId = pageId ?? md.page_id ?? null;
    psid = psid ?? md.sender_psid ?? null;
  }
  if (!pageId || !psid) return json({ error: "no messenger page_id/psid for this thread" }, 404);

  const { data: binding } = await admin
    .from("messenger_page_bindings")
    .select("page_access_token")
    .eq("page_id", pageId)
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  const pageToken = (binding as any)?.page_access_token as string | undefined;
  if (!pageToken) return json({ error: "no page access token configured for this page" }, 500);

  let text = parsed.data.message;
  let disclosureAppended = false;
  if (parsed.data.ai_assisted) {
    const r = appendDisclosure(text, true, "he");
    text = r.text;
    disclosureAppended = r.appended;
  }

  const fbRes = await fetch(`${GRAPH}/${pageId}/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text },
    }),
  });
  const fbJson: any = await fbRes.json().catch(() => ({}));
  if (!fbRes.ok || fbJson?.error) {
    return json({ success: false, error: "messenger send failed", details: fbJson }, 502);
  }

  if (parsed.data.lead_id) {
    await admin.from("messages").insert({
      lead_id: parsed.data.lead_id,
      platform: "messenger",
      channel: "messenger",
      direction: "outbound",
      sender_type: parsed.data.ai_assisted ? "ai" : "agent",
      ai_assisted: !!parsed.data.ai_assisted,
      disclosure_appended: disclosureAppended,
      content: text,
      metadata: { page_id: pageId, psid, mid: fbJson.message_id ?? null },
    });
  }

  return json({ success: true, message_id: fbJson.message_id ?? null });
});
