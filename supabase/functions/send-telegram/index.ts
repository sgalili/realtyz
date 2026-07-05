// send-telegram — outbound reply on Telegram, scoped to Udi's workspace.
// Body: { lead_id?, chat_id?, message, ai_assisted? }
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
const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const Body = z.object({
  lead_id: z.string().uuid().optional(),
  chat_id: z.string().min(1).optional(),
  message: z.string().min(1).max(4000),
  ai_assisted: z.boolean().optional(),
}).refine((v) => !!v.chat_id || !!v.lead_id, { message: "chat_id or lead_id required" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!TG_TOKEN) return json({ error: "TELEGRAM_BOT_TOKEN not configured" }, 500);

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
    return json({ error: "telegram provider not enabled for this workspace" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Resolve chat_id from lead if needed — read from latest inbound message metadata.
  let chatId = parsed.data.chat_id ?? null;
  if (!chatId && parsed.data.lead_id) {
    const { data: last } = await admin
      .from("messages")
      .select("metadata")
      .eq("lead_id", parsed.data.lead_id)
      .eq("platform", "telegram")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    chatId = (last as any)?.metadata?.chat_id ?? null;
  }
  if (!chatId) return json({ error: "no telegram chat_id for this thread" }, 404);

  let text = parsed.data.message;
  let disclosureAppended = false;
  if (parsed.data.ai_assisted) {
    const r = appendDisclosure(text, true, "he");
    text = r.text;
    disclosureAppended = r.appended;
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const tgJson: any = await tgRes.json().catch(() => ({}));
  if (!tgRes.ok || !tgJson?.ok) {
    return json({ success: false, error: "telegram send failed", details: tgJson }, 502);
  }

  if (parsed.data.lead_id) {
    await admin.from("messages").insert({
      lead_id: parsed.data.lead_id,
      platform: "telegram",
      channel: "telegram",
      direction: "outbound",
      sender_type: parsed.data.ai_assisted ? "ai" : "agent",
      ai_assisted: !!parsed.data.ai_assisted,
      disclosure_appended: disclosureAppended,
      content: text,
      metadata: { chat_id: chatId, message_id: tgJson.result?.message_id },
    });
  }

  return json({ success: true, message_id: tgJson.result?.message_id ?? null });
});
