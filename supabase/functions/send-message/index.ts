import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const WebhookPayload = z.object({
  voter_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
  channel: z.string().default("whatsapp"),
  phone_number: z.string().optional(),
  attachment: z.unknown().optional(),
  drip: z.object({
    enabled: z.boolean().default(false),
    daily_limit: z.number().int().min(1).max(1000).default(50),
    send_window_start: z.string().default("08:00"),
    send_window_end: z.string().default("20:00"),
    stagger_min_minutes: z.number().int().min(1).max(120).default(7),
    stagger_max_minutes: z.number().int().min(1).max(240).default(23),
  }).optional(),
});

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

    const { voter_id, content, channel, phone_number, attachment, drip } = parsed.data;

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
      .from("voters")
      .select("phone_number, full_name")
      .eq("id", voter_id)
      .single();

    const { data: approval, error: dbError } = await supabase
      .from("approval_queue")
      .insert({
        user_id: userData.user.id,
        content_type: "outbound_message",
        platform: channel,
        target_voter_id: voter_id,
        target_label: voter?.full_name || phone_number || voter?.phone_number || null,
        title: `הודעה ממתינה לאישור - ${voter?.full_name || channel}`,
        proposed_content: content,
        confidence_score: 100,
        requires_human_review: true,
        source_citations: [],
        metadata: { phone_number: phone_number || voter?.phone_number, attachment, drip_feed: drip || { enabled: false } },
        created_by_ai: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to queue message", details: dbError.message }),
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
