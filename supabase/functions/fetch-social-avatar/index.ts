// Best-effort avatar fetcher for social channels (facebook, instagram, x,
// tiktok, youtube). We resolve the public profile page for the given handle
// and pull the og:image meta tag. When the provider blocks unauthenticated
// scraping we return a soft failure so the UI can display a toast without
// breaking the CRM.
//
// POST body:
//   { lead_id: string, channel: 'facebook'|'instagram'|'x'|'tiktok'|'youtube', handle: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function profileUrl(channel: string, handle: string): string | null {
  const h = handle.replace(/^@/, "").trim();
  if (!h) return null;
  switch (channel) {
    case "facebook":   return `https://www.facebook.com/${h}`;
    case "instagram":  return `https://www.instagram.com/${h}/`;
    case "x":          return `https://x.com/${h}`;
    case "tiktok":     return `https://www.tiktok.com/@${h}`;
    case "youtube":    return h.startsWith("UC") ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
    default:           return null;
  }
}

function extractOgImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { lead_id, channel, handle } = await req.json();
    if (!lead_id || !channel || !handle) {
      return new Response(JSON.stringify({ error: "missing_params" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = profileUrl(channel, handle);
    if (!url) {
      return new Response(JSON.stringify({ error: "unsupported_channel" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let picture: string | null = null;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RealtyzBot/1.0)" } });
      if (res.ok) {
        const html = await res.text();
        picture = extractOgImage(html);
      }
    } catch (e) {
      console.warn("scrape failed", channel, handle, e);
    }

    if (!picture) {
      return new Response(JSON.stringify({ success: false, error: "not_found", channel, url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("leads").update({ profile_picture_url: picture }).eq("id", lead_id);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, url: picture }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fetch-social-avatar error:", err);
    return new Response(JSON.stringify({ error: err?.message || "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
