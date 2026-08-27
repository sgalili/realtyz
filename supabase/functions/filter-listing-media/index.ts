// filter-listing-media — Smart image filter for listing galleries.
//
// Uses a vision model through the Lovable AI Gateway to detect images that are
// logos/branding or that contain human faces/heads/bodies. Every detected image
// is added PERMANENTLY to `listings.source_metadata.removed_photo_keys`, which
// the existing DB trigger uses to strip the image from every gallery column on
// write — so a later Yad2/Homely/Facebook re-sync can never restore it.
//
// Request:  { listing_id: string, limit?: number }
// Response: { ok, checked, blocked: string[], removed_keys: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const mediaKey = (url: string): string => {
  const clean = String(url || "").split("?")[0];
  const file = clean.split("/").pop() || clean;
  return (file.trim() || clean.trim()).toLowerCase();
};

const urlsFrom = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const p of value) {
    const url = typeof p === "string" ? p : ((p as any)?.url ?? (p as any)?.src);
    if (typeof url === "string" && url.trim()) out.push(url.trim());
  }
  return out;
};

async function classify(url: string): Promise<{ logo: boolean; person: boolean } | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          {
            role: "system",
            content:
              'You classify real-estate listing photos. Reply with ONLY compact JSON: {"logo":bool,"person":bool}. ' +
              '"logo" = the image is a logo, watermark, brand card, agency banner, business card, text-only graphic or avatar/headshot placeholder. ' +
              '"person" = any human face, head, or body is visible (even small or partial). Interior/exterior property photos, floor plans and maps are neither.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Classify this image." },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    if (res.status === 429 || res.status >= 500) return null; // transient: leave the photo alone
    if (!res.ok) {
      console.error("[filter-listing-media] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const payload = await res.json();
    const raw = String(payload?.choices?.[0]?.message?.content ?? "");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return { logo: !!parsed?.logo, person: !!parsed?.person };
  } catch (e) {
    console.error("[filter-listing-media] classify failed", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) return json({ ok: false, error: "missing_ai_key" }, 500);
    const body = await req.json().catch(() => ({} as any));
    const listingId = String(body?.listing_id ?? "").trim();
    const limit = Math.max(1, Math.min(30, Number(body?.limit) || 20));
    if (!listingId) return json({ ok: false, error: "listing_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { data: listing, error } = await admin
      .from("listings")
      .select("id, media_photos, image_url, source_metadata")
      .eq("id", listingId)
      .maybeSingle();
    if (error || !listing) return json({ ok: false, error: error?.message ?? "listing_not_found" }, 404);

    const meta = (listing as any).source_metadata && typeof (listing as any).source_metadata === "object"
      ? { ...(listing as any).source_metadata }
      : {};
    const removed: string[] = Array.isArray(meta.removed_photo_keys)
      ? meta.removed_photo_keys.map((k: unknown) => String(k).toLowerCase())
      : [];
    const checked: string[] = Array.isArray(meta.media_vision_checked)
      ? meta.media_vision_checked.map((k: unknown) => String(k).toLowerCase())
      : [];

    const all = Array.from(new Set([
      ...urlsFrom((listing as any).media_photos),
      ...(typeof (listing as any).image_url === "string" && (listing as any).image_url.trim()
        ? [(listing as any).image_url.trim()]
        : []),
    ])).filter((u) => /^https?:\/\//i.test(u));

    const pending = all.filter((u) => {
      const k = mediaKey(u);
      return !removed.includes(k) && !checked.includes(k);
    }).slice(0, limit);

    const blocked: string[] = [];
    for (const url of pending) {
      const verdict = await classify(url);
      const k = mediaKey(url);
      if (!verdict) continue; // transient failure — try again on a later run
      checked.push(k);
      if (verdict.logo || verdict.person) {
        blocked.push(url);
        if (!removed.includes(k)) removed.push(k);
      }
    }

    if (pending.length > 0) {
      const blockedKeys = new Set(removed);
      const keptPhotos = urlsFrom((listing as any).media_photos).filter((u) => !blockedKeys.has(mediaKey(u)));
      const currentMain = typeof (listing as any).image_url === "string" ? (listing as any).image_url.trim() : "";
      const nextMain = currentMain && blockedKeys.has(mediaKey(currentMain)) ? (keptPhotos[0] ?? null) : currentMain || null;

      const { error: upErr } = await admin
        .from("listings")
        .update({
          media_photos: keptPhotos,
          image_url: nextMain,
          source_metadata: {
            ...meta,
            removed_photo_keys: Array.from(new Set(removed)),
            media_vision_checked: Array.from(new Set(checked)),
            media_vision_at: new Date().toISOString(),
          },
        })
        .eq("id", listingId);
      if (upErr) console.error("[filter-listing-media] update failed", upErr);
    }

    return json({ ok: true, checked: pending.length, blocked, removed_keys: Array.from(new Set(removed)) });
  } catch (e) {
    console.error("[filter-listing-media] fatal", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
