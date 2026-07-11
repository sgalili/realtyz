import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const WebhookPayload = z.object({
  lead_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
  channel: z.string().default("whatsapp"),
  phone_number: z.string().optional(),
  attachment: z.unknown().optional(),
  invite_channel: z.string().optional(),
  drip: z.object({
    enabled: z.boolean().default(false),
    daily_limit: z.number().int().min(1).max(1000).default(50),
    send_window_start: z.string().default("08:00"),
    send_window_end: z.string().default("20:00"),
    stagger_min_minutes: z.number().int().min(1).max(120).default(7),
    stagger_max_minutes: z.number().int().min(1).max(240).default(23),
  }).optional(),
});

async function buildInviteLink(
  supabase: ReturnType<typeof createClient>,
  channel: string,
  userId: string,
): Promise<string | null> {
  // Look up the workspace's shared social profile to derive m.me / ig.me links.
  const { data: mem } = await supabase
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  const workspaceId = (mem as any)?.workspace_id;
  if (!workspaceId) return null;
  const { data: prof } = await supabase
    .from("workspace_social_profile")
    .select("facebook_page_id, facebook_page_name, connected_platforms")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const p: any = prof || {};
  const pageId = p.facebook_page_id || p.facebook_page_name;
  const connected: any = p.connected_platforms || {};
  const igUser = connected?.instagram?.username || connected?.instagram?.handle;
  const tgBot = connected?.telegram?.bot_username;
  switch (channel) {
    case "messenger":
    case "facebook":
      return pageId ? `https://m.me/${pageId}` : null;
    case "instagram":
      return igUser ? `https://ig.me/m/${igUser}` : null;
    case "telegram":
      return tgBot ? `https://t.me/${tgBot}` : null;
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = WebhookPayload.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lead_id, content, channel, phone_number, attachment, drip, invite_channel } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: "נדרש חיבור משתמש כדי לשלוח לאישור" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: voter } = await supabase
      .from("leads")
      .select("phone_number, full_name")
      .eq("id", lead_id)
      .single();

    // If this is an invite send, resolve the destination channel deep-link and
    // template {LINK} into the content.
    let finalContent = content;
    if (invite_channel && content.includes("{LINK}")) {
      const url = await buildInviteLink(supabase, invite_channel, userData.user.id);
      finalContent = content.replace(/\{LINK\}/g, url || "");
    }

    const { data: approval, error: dbError } = await supabase
      .from("approval_queue")
      .insert({
        user_id: userData.user.id,
        content_type: "outbound_message",
        platform: channel,
        target_lead_id: lead_id,
        target_label: voter?.full_name || phone_number || voter?.phone_number || null,
        title: `הודעה ממתינה לאישור - ${voter?.full_name || channel}`,
        proposed_content: finalContent,
        confidence_score: 100,
        requires_human_review: true,
        source_citations: [],
        metadata: { phone_number: phone_number || voter?.phone_number, attachment, drip_feed: drip || { enabled: false }, invite_channel: invite_channel || null },
        created_by_ai: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      return new Response(
        JSON.stringify({
          error: "Failed to queue message",
          code: (dbError as any).code,
          details: dbError.message,
          hint: (dbError as any).hint,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        approval_id: approval.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
