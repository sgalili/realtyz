// Best-effort avatar fetcher for social channels. We first try the public
// profile page metadata and then a metadata proxy fallback. Providers often
// block server-side reads, so every failure returns structured JSON with a
// human-readable reason for the CRM toast.
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
    if (channel === "facebook" && host.includes("facebook.com")) {
      if (parts[0] === "profile.php") return u.searchParams.get("id") || "";
      return parts[0] || "";
    }
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

type Attempt = { provider: string; status?: number; message?: string };

function reasonFor(channel: string, attempts: Attempt[]): string {
  const details = attempts
    .map((a) => [a.provider, a.status ? `HTTP ${a.status}` : null, a.message].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("; ");
  if (details) return `לא ניתן לשלוף תמונה מ-${channel}: ${details}`;
  return `לא נמצאה תמונת פרופיל ציבורית ב-${channel}. ייתכן שהפרופיל פרטי, חסום לסריקה, או שהקישור אינו תקין`;
}

function extractOgImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

function isHttpImage(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function messageFromPayload(payload: any): string | undefined {
  const msg = payload?.message || payload?.error?.message || payload?.error || payload?.details || payload?.data?.url || payload?.code;
  return msg ? String(msg).slice(0, 280) : undefined;
}

async function readPayload(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 280) }; }
}

async function fetchHtmlAvatar(url: string, attempts: Attempt[]): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    attempts.push({ provider: "public profile", status: res.status });
    return null;
  }
  const html = await res.text();
  const picture = extractOgImage(html);
  if (!picture) attempts.push({ provider: "public profile", status: res.status, message: "no og:image" });
  return picture;
}

async function fetchMicrolinkAvatar(url: string, attempts: Attempt[]): Promise<string | null> {
  const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=false`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readPayload(res);
  if (!res.ok || payload?.status === "fail") {
    attempts.push({ provider: "metadata proxy", status: res.status, message: messageFromPayload(payload) });
    return null;
  }
  const picture = payload?.data?.image?.url || payload?.data?.logo?.url;
  if (isHttpImage(picture)) return picture.trim();
  attempts.push({ provider: "metadata proxy", status: res.status, message: "no image in metadata" });
  return null;
}

async function fetchUnavatar(channel: string, handle: string, attempts: Attempt[]): Promise<string | null> {
  const mapped = channel === "x" ? "x" : channel;
  if (!["x", "youtube", "facebook"].includes(mapped)) return null;
  const res = await fetch(`https://unavatar.io/${mapped}/${encodeURIComponent(handle)}?fallback=false`, {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("image/")) return res.url;
  const payload = type.includes("json") ? await readPayload(res) : {};
  attempts.push({ provider: "avatar service", status: res.status, message: messageFromPayload(payload) });
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { lead_id, channel, handle } = await req.json();
    if (!lead_id || !channel || !handle) {
      return json({ success: false, error: "missing_params", reason: "חסרים מזהה איש קשר, ערוץ או פרופיל לשליפה" });
    }
    if (!["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"].includes(String(channel))) {
      return json({ success: false, error: "unsupported_channel", reason: `הערוץ ${channel} לא נתמך לשליפת תמונת פרופיל` });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = profileUrl(channel, handle);
    const cleaned = cleanHandle(channel, handle);
    if (!url) {
      return json({ success: false, error: "unsupported_channel", reason: `הערוץ ${channel} לא נתמך לשליפת תמונת פרופיל` });
    }

    let picture: string | null = null;
    const attempts: Attempt[] = [];
    try {
      picture = await fetchHtmlAvatar(url, attempts);
    } catch (e) {
      attempts.push({ provider: "public profile", message: e instanceof Error ? e.message : String(e) });
    }
    if (!picture) {
      try { picture = await fetchMicrolinkAvatar(url, attempts); }
      catch (e) { attempts.push({ provider: "metadata proxy", message: e instanceof Error ? e.message : String(e) }); }
    }
    if (!picture && cleaned) {
      try { picture = await fetchUnavatar(channel, cleaned, attempts); }
      catch (e) { attempts.push({ provider: "avatar service", message: e instanceof Error ? e.message : String(e) }); }
    }

    if (!picture) {
      return json({ success: false, error: "not_found", channel, url, attempts, reason: reasonFor(channel, attempts) });
    }

    const { error } = await supabase.from("leads").update({ profile_picture_url: picture }).eq("id", lead_id);
    if (error) return json({ success: false, error: "database_update_failed", reason: error.message, channel, url });

    return json({ success: true, url: picture, channel });
  } catch (err: any) {
    console.error("fetch-social-avatar error:", err);
    return json({ success: false, error: "fetch_social_avatar_failed", reason: err?.message || "internal_error" });
  }
});
