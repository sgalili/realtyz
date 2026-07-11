// Best-effort avatar fetcher for social channels (facebook, instagram, x,
// tiktok, youtube). We resolve the public profile page for the given handle
// and pull the og:image meta tag. When the provider blocks unauthenticated
// scraping we return a soft failure so the UI can display a toast without
// breaking the CRM.
//
// POST body:
//   { lead_id: string, channel: 'facebook'|'instagram'|'linkedin'|'x'|'tiktok'|'youtube', handle: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function cleanHandle(channel: string, handle: string): string {
  let h = String(handle || "").trim();
  if (!h) return "";
  h = h.replace(/^@/, "");
  try {
    const u = new URL(h.startsWith("http") ? h : `https://${h}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const parts = u.pathname.split("/").map((p) => p.trim()).filter(Boolean);
    if (channel === "instagram" && host.includes("instagram.com")) return parts[0] || "";
    if (channel === "facebook" && host.includes("facebook.com")) return parts[0] || "";
    if (channel === "linkedin" && host.includes("linkedin.com")) return parts.slice(0, 2).join("/") || parts[0] || "";
    if (channel === "x" && (host === "x.com" || host === "twitter.com")) return parts[0] || "";
    if (channel === "tiktok" && host.includes("tiktok.com")) return (parts[0] || "").replace(/^@/, "");
    if (channel === "youtube" && host.includes("youtube.com")) return parts.join("/") || "";
  } catch { /* not a URL */ }
  return h.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

function profileUrl(channel: string, handle: string): string | null {
  const h = cleanHandle(channel, handle);
  if (!h) return null;
  switch (channel) {
    case "facebook":   return `https://www.facebook.com/${h}`;
    case "instagram":  return `https://www.instagram.com/${h}/`;
    case "linkedin":   return h.includes("/") ? `https://www.linkedin.com/${h}` : `https://www.linkedin.com/in/${h}`;
    case "x":          return `https://x.com/${h}`;
    case "tiktok":     return `https://www.tiktok.com/@${h}`;
    case "youtube":    return h.startsWith("channel/") || h.startsWith("@") ? `https://www.youtube.com/${h}` : h.startsWith("UC") ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
    default:           return null;
  }
}

function reasonFor(channel: string, status?: number): string {
  if (status && status >= 400) return `הפרופיל ב-${channel} לא נגיש לציבור או שהפלטפורמה החזירה HTTP ${status}`;
  return `לא נמצאה תמונת פרופיל ציבורית ב-${channel}. ייתכן שהפרופיל פרטי, חסום לסריקה, או שהקישור אינו תקין`;
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
      return json({ success: false, error: "missing_params", reason: "חסרים מזהה איש קשר, ערוץ או פרופיל לשליפה" });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = profileUrl(channel, handle);
    if (!url) {
      return json({ success: false, error: "unsupported_channel", reason: `הערוץ ${channel} לא נתמך לשליפת תמונת פרופיל` });
    }

    let picture: string | null = null;
    let providerStatus: number | undefined;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
        },
      });
      providerStatus = res.status;
      if (res.ok) {
        const html = await res.text();
        picture = extractOgImage(html);
      }
    } catch (e) {
      console.warn("scrape failed", channel, handle, e);
    }

    if (!picture) {
      return json({ success: false, error: "not_found", channel, url, reason: reasonFor(channel, providerStatus) });
    }

    const { error } = await supabase.from("leads").update({ profile_picture_url: picture }).eq("id", lead_id);
    if (error) return json({ success: false, error: "database_update_failed", reason: error.message, channel, url });

    return json({ success: true, url: picture, channel });
  } catch (err: any) {
    console.error("fetch-social-avatar error:", err);
    return json({ success: false, error: "fetch_social_avatar_failed", reason: err?.message || "internal_error" });
  }
});
