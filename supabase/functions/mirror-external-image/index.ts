// Mirrors an external image URL into the workspace's media-library bucket and
// creates a media_library row so downstream flows can rely on DB-hosted URLs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extFromContentType(ct: string, fallback = "jpg") {
  const m = ct.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("svg")) return "svg";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const url = String((body as { url?: unknown }).url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: "bad_url" }, 400);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Realtyz-Mirror)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return json({ ok: false, error: `fetch_failed_${res.status}` }, 502);
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return json({ ok: false, error: "not_an_image" }, 415);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 200) return json({ ok: false, error: "image_too_small" }, 415);

    const ext = extFromContentType(ct);
    const key = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error: upErr } = await admin.storage.from("media-library").upload(key, buf, {
      contentType: ct,
      upsert: false,
    });
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    const { data: pub } = admin.storage.from("media-library").getPublicUrl(key);
    const publicUrl = pub.publicUrl;

    await admin.from("media_library").insert({
      user_id: user.id,
      file_name: url.split("/").pop()?.split("?")[0] || `image.${ext}`,
      storage_path: key,
      public_url: publicUrl,
      mime_type: ct,
      size_bytes: buf.byteLength,
      media_kind: "image",
      source: "external_mirror",
      source_metadata: { source_url: url },
    });

    return json({ ok: true, public_url: publicUrl });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "unexpected" }, 500);
  }
});
