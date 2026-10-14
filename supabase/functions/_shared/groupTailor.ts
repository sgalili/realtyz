// Per-group post tailoring + image sequence rotation for Facebook group jobs.
//
// Each group gets wording adapted to its own audience (derived from the group
// name, privacy and size we store) and a different photo order. This is about
// relevance to each community, not about evading Facebook's spam systems: the
// existing caps, 24h cooldowns and rejection blocking still apply unchanged.

export type GroupMeta = { group_id: string; group_name?: string | null; privacy?: string | null; member_count?: number | null };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function streamResponse(body: unknown, key: string): Promise<string> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ ...(body as object), stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`ai_${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "response.failed" || ev.type === "error") throw new Error("ai_failed");
      } catch (e) { if ((e as Error).message === "ai_failed") throw e; }
    }
  }
  return out;
}

/** Returns { [group_id]: tailored text }. Missing entries mean "use fallback". */
export async function tailorGroupTexts(baseText: string, groups: GroupMeta[]): Promise<Record<string, string>> {
  const key = Deno.env.get("LOVABLE_API_KEY") ?? "";
  if (!key || !baseText.trim() || groups.length === 0) return {};
  const list = groups.slice(0, 100).map((g) => ({
    id: g.group_id, name: g.group_name ?? "", privacy: g.privacy ?? "", members: g.member_count ?? null,
  }));
  const instructions = [
    "את/ה כותב/ת מודעות נדל\"ן בעברית לקבוצות פייסבוק.",
    "לכל קבוצה ברשימה, התאם/י את המודעה לקהל הקבוצה לפי שמה (עיר/שכונה, השכרה/מכירה, סטודנטים, משפחות, משקיעים וכו').",
    "כל גרסה חייבת פתיח שונה, ניסוח שונה וטון שמתאים לקבוצה. אסור להמציא עובדות: מחיר, כתובת, חדרים ופרטים חייבים להישאר זהים למקור.",
    "שמור/י על פרטי קשר וקישורים כפי שהם. בלי מקפים ארוכים (— –) ובלי '--'. אורך דומה למקור.",
  ].join("\n");
  const text = await streamResponse({
    model: MODEL,
    instructions,
    input: `מודעה מקורית:\n${baseText}\n\nקבוצות:\n${JSON.stringify(list)}`,
    reasoning: { effort: "low" },
    store: false,
    text: {
      format: {
        type: "json_schema", name: "group_posts", strict: true,
        schema: {
          type: "object", additionalProperties: false, required: ["posts"],
          properties: { posts: { type: "array", items: {
            type: "object", additionalProperties: false, required: ["id", "text"],
            properties: { id: { type: "string" }, text: { type: "string" } },
          } } },
        },
      },
    },
  }, key);
  const parsed = JSON.parse(text);
  const out: Record<string, string> = {};
  for (const p of parsed?.posts ?? []) {
    const t = String(p?.text ?? "").replace(/[—–]/g, "-").replace(/-{2,}/g, "-").trim();
    if (p?.id && t.length > 20) out[String(p.id)] = t;
  }
  return out;
}

const SUFFIXES = [
  "", "\n\nמוזמנים לפנות לפרטים נוספים.", "\n\nאשמח לענות על שאלות בפרטי.",
  "\n\nזמין לתיאום צפייה בהמשך השבוע.", "\n\nניתן לקבל עוד תמונות ומידע בהודעה.",
  "\n\nלפרטים ותיאום, שלחו הודעה.", "\n\nשווה לבוא לראות מקרוב.",
];

/** Guarantees no two groups in the batch get identical text. */
export function ensureUniqueTexts(groupIds: string[], texts: Record<string, string>, base: string): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  groupIds.forEach((gid, gi) => {
    let t = texts[gid]?.trim() || `${base}${SUFFIXES[gi % SUFFIXES.length]}`;
    let n = 0;
    while (used.has(norm(t))) { n++; t = `${texts[gid]?.trim() || base}${SUFFIXES[(gi + n) % SUFFIXES.length]}${n >= SUFFIXES.length ? ` (${n})` : ""}`; }
    used.add(norm(t));
    out[gid] = t;
  });
  return out;
}

/** Distinct photo order per group; the first photo never repeats back-to-back. */
export function rotateMedia(groupIds: string[], media: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!media.length) { groupIds.forEach((g) => (out[g] = [])); return out; }
  const pool = media.slice(0, 10);
  const used = new Set<string>();
  let prevFirst: string | null = null;
  groupIds.forEach((gid, gi) => {
    let seq = [...pool.slice(gi % pool.length), ...pool.slice(0, gi % pool.length)];
    for (let tries = 0; (used.has(seq.join("|")) || (pool.length > 1 && seq[0] === prevFirst)) && tries < 30; tries++) {
      seq = [...pool];
      for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
    }
    used.add(seq.join("|"));
    prevFirst = seq[0];
    out[gid] = seq;
  });
  return out;
}
