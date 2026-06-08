// kb-ingest-link: Ingest a media URL (YouTube, article, etc.) into the
// Knowledge Base + Media Library, distilling sales methodologies for the
// "Udi" AI persona WITHOUT exposing the source URL to the model output.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").split(/[/?#]/)[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/(shorts|embed|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchYouTubeMeta(videoId: string): Promise<{
  title: string;
  author: string;
  thumbnail: string;
  description: string;
}> {
  const oembed = await fetch(
    `https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`,
  );
  const meta = oembed.ok
    ? await oembed.json().catch(() => ({}))
    : ({} as Record<string, unknown>);
  let description = "";
  try {
    const html = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "user-agent": "Mozilla/5.0" },
    }).then((r) => r.text());
    const m =
      html.match(/"shortDescription":"([^"]+)"/) ??
      html.match(/<meta name="description" content="([^"]+)"/);
    if (m) {
      description = JSON.parse(`"${m[1].replace(/"/g, '\\"')}"`);
    }
  } catch {
    // ignore
  }
  return {
    title: String(meta.title ?? `YouTube · ${videoId}`),
    author: String(meta.author_name ?? ""),
    thumbnail: String(
      meta.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ),
    description,
  };
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  // Try the public timedtext endpoint (works for videos with auto-captions).
  for (const lang of ["en", "iw", "he"]) {
    try {
      const r = await fetch(
        `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`,
      );
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const events = (j as { events?: Array<{ segs?: Array<{ utf8?: string }> }> } | null)
        ?.events;
      if (!events) continue;
      const text = events
        .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 50) return text;
    } catch {
      // try next lang
    }
  }
  return "";
}

async function fetchGenericPage(url: string): Promise<{ title: string; text: string }> {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`fetch failed ${r.status}`);
  const html = await r.text();
  const title =
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? url;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);
  return { title, text };
}

async function distillForUdi(
  rawContent: string,
  contextTitle: string,
  intent: string,
): Promise<string> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const intentLine = intent.trim()
    ? `USER FOCUS — extract specifically: ${intent.trim()}. Prioritize this lens above all else.`
    : "";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: [
            "You are training the 'Udi' real-estate sales AI persona.",
            "From the supplied content, distill PRINCIPLES, FRAMEWORKS, OBJECTION HANDLERS, SCRIPTS, and ACTIONABLE SALES METHODOLOGIES that improve closing rate and prosperity.",
            intentLine,
            "Output in Hebrew. Use clear sections: עקרונות מנחים / טכניקות מכירה / ניסוחים מומלצים / טיפול בהתנגדויות / צעדים אופרטיביים.",
            "CRITICAL PRIVACY RULE: NEVER mention or hint at the original source — no URLs, no author names, no platform names (YouTube, podcast, book, course), no 'according to'. Present the wisdom as Udi's internal playbook.",
            "Do NOT use em-dash, en-dash, or '--'. Plain prose only.",
          ].filter(Boolean).join(" "),
        },
        {
          role: "user",
          content: `Internal reference: ${contextTitle}\n\n---\n${rawContent.slice(0, 40_000)}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`distill failed ${res.status}: ${t}`);
  }
  const j = await res.json();
  const out = j?.choices?.[0]?.message?.content;
  if (!out || typeof out !== "string") throw new Error("distill returned no text");
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null) as { url?: string; intent?: string } | null;
    const url = body?.url?.trim();
    const intent = (body?.intent ?? "").toString().slice(0, 500);
    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: "url required" }, 400);
    }

    const ytId = extractYouTubeId(url);
    let title = url;
    let rawContent = "";
    let mediaKind: "video" | "document" = "document";
    let thumbnail = "";
    let author = "";

    if (ytId) {
      mediaKind = "video";
      const meta = await fetchYouTubeMeta(ytId);
      title = meta.title;
      author = meta.author;
      thumbnail = meta.thumbnail;
      const transcript = await fetchYouTubeTranscript(ytId);
      rawContent = [
        meta.title,
        meta.author ? `By ${meta.author}` : "",
        meta.description,
        transcript,
      ]
        .filter(Boolean)
        .join("\n\n");
      if (rawContent.trim().length < 80) {
        return json(
          { error: "Could not extract enough content from this video (no captions / description)." },
          422,
        );
      }
    } else {
      const page = await fetchGenericPage(url);
      title = page.title;
      rawContent = page.text;
      if (rawContent.length < 200) {
        return json({ error: "Page had too little content to ingest." }, 422);
      }
    }

    // Distill into Udi-persona-ready knowledge (no source leakage).
    const distilled = await distillForUdi(rawContent, title, intent);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Knowledge document — raw_text is the SANITIZED distilled version.
    //    Source URL is stored ONLY in source_metadata for audit; never sent
    //    to the persona since kb-query pulls from raw_text/chunks.
    const { data: doc, error: docErr } = await admin
      .from("knowledge_documents")
      .insert({
        user_id: user.id,
        source_type: ytId ? "video" : "text",
        title,
        raw_text: distilled,
        source_metadata: {
          tags: ["#MediaLink", "#SalesMethodology", ytId ? "#YouTube" : "#Web"],
          source_url: url,
          source_author: author || null,
          source_kind: ytId ? "youtube" : "web",
          thumbnail: thumbnail || null,
          description: ytId ? (rawContent.split("\n\n").find((s) => s && !s.startsWith("By ") && s !== title) ?? "").slice(0, 400) : null,
          video_id: ytId,
          distilled_for_persona: "udi",
          captured_at: new Date().toISOString(),
        },
        is_active: true,
      })
      .select()
      .single();
    if (docErr) throw docErr;

    // 2) Chunk distilled text for retrieval.
    const chunks: string[] = [];
    const maxChars = 1200;
    let i = 0;
    while (i < distilled.length) {
      chunks.push(distilled.slice(i, i + maxChars));
      i += maxChars;
    }
    if (chunks.length) {
      await admin.from("knowledge_chunks").insert(
        chunks.map((content, idx) => ({
          document_id: doc.id,
          user_id: user.id,
          chunk_index: idx,
          content,
        })),
      );
      await admin
        .from("knowledge_documents")
        .update({ chunk_count: chunks.length })
        .eq("id", doc.id);
    }

    // 3) Media Library — store the original link for easy re-access.
    const { data: media } = await admin
      .from("media_library")
      .insert({
        user_id: user.id,
        file_name: title,
        storage_path: `external/${ytId ?? encodeURIComponent(url)}`,
        public_url: url,
        mime_type: ytId ? "video/youtube" : "text/html",
        media_kind: mediaKind,
        source: ytId ? "youtube" : "web",
        source_metadata: {
          url,
          author: author || null,
          thumbnail: thumbnail || null,
          knowledge_document_id: doc.id,
        },
      })
      .select()
      .single();

    return json({
      success: true,
      document_id: doc.id,
      media_id: media?.id ?? null,
      chunks: chunks.length,
      title,
    });
  } catch (e) {
    console.error("kb-ingest-link error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
