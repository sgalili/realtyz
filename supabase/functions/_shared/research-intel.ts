// _shared/research-intel.ts
// Cross-pipeline injector for owner-curated property/location intelligence.
//
// Pulls active rows from `system_intelligence_kb` where `source` is
// `research_insight` or `file_insight` and the stored brief mentions one of
// the listing's location anchors (city / neighborhood / address / title /
// explicit research_query). Returns a formatted `#PROPERTY_RESEARCH_INTELLIGENCE`
// block ready to prepend to any generation prompt (posts, comment replies,
// voice scripts).
//
// Also exports the Hebrew/English research-trigger regex used by the WhatsApp
// Master companion to detect "תחקור את שכונת ..." / "תעשה לי דוח על ..." style
// directives and route them straight into `master-research`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RESEARCH_SOURCES = ["research_insight", "file_insight"];
const MAX_ROWS = 5;
const MAX_RULE_CHARS = 1400;

export const RESEARCH_TRIGGERS =
  /(תחקור|תחקיר|תחקרי|תחקרו|מחקר|תעשה\s+לי\s+דוח|דוח\s+על|דו"?ח\s+על|בדוק\s+על|נתח\s+את\s+שכונת|נתח\s+שכונה|חקור\s+שכונה|מודיעין\s+על|research|deep\s+research|investigate)/i;

export function hasResearchTrigger(text: string | null | undefined): boolean {
  if (!text) return false;
  return RESEARCH_TRIGGERS.test(text);
}

// Best-effort extraction of the subject of the research request. Strips the
// trigger verb so the master-research engine gets a clean target string.
export function extractResearchSubject(text: string): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  // Remove common leading verbs/phrases.
  return t
    .replace(
      /^\s*(תחקור(?:\s+לי)?|תחקיר(?:\s+על)?|תחקרי|תחקרו|תעשה\s+לי\s+דוח\s+(?:על|מקיף\s+על)|דוח\s+על|דו"?ח\s+על|בדוק\s+(?:לי\s+)?על|נתח\s+(?:את\s+)?שכונת|נתח\s+שכונה|חקור\s+שכונה|מודיעין\s+על|research|deep\s+research|investigate)\s+(?:את\s+)?(?:שכונת\s+|אזור\s+|רחוב\s+|העיר\s+|איזור\s+)?/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function escapeIlike(value: string): string {
  // PostgREST `.ilike()` accepts `%` wildcards; escape the user's own % / _.
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function dedupeKeywords(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s.length < 2) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 6);
}

async function resolveWorkspace(userId: string): Promise<string> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await admin
      .from("profiles")
      .select("active_workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    return (data?.active_workspace_owner_id as string | undefined) || userId;
  } catch {
    return userId;
  }
}

/**
 * Fetch and format owner-curated research/file insights that match any of
 * the supplied location/property keywords. Returns "" when nothing matches
 * so the caller can safely join with other prompt blocks.
 */
export async function fetchResearchIntelBlock(
  userId: string | null | undefined,
  locationKeywords: Array<string | null | undefined>,
): Promise<string> {
  if (!userId) return "";
  const keywords = dedupeKeywords(locationKeywords);
  if (keywords.length === 0) return "";

  const workspace = await resolveWorkspace(userId);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // OR across keywords against rule_text and raw_input. Two columns -> emit
  // an `.or()` filter with all combinations.
  const orParts: string[] = [];
  for (const kw of keywords) {
    const safe = `%${escapeIlike(kw)}%`;
    orParts.push(`rule_text.ilike.${safe}`);
    orParts.push(`raw_input.ilike.${safe}`);
  }

  const { data, error } = await admin
    .from("system_intelligence_kb")
    .select("rule_text, raw_input, source, metadata, created_at")
    .eq("workspace_owner_id", workspace)
    .eq("is_active", true)
    .in("source", RESEARCH_SOURCES)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error || !Array.isArray(data) || data.length === 0) return "";

  const lines: string[] = [
    "#PROPERTY_RESEARCH_INTELLIGENCE",
    "Owner-curated live web research and uploaded-document insights tied to this listing's location/property.",
    "These are factual ground-truth — weave the concrete data points (prices, schools, transit, audience profile, air directions) directly into the output. Never contradict them. Cite the area name naturally.",
  ];

  for (const row of data) {
    const tag = row.source === "file_insight" ? "FILE" : "RESEARCH";
    const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata as Record<string, unknown> : {};
    const subject = (meta.research_query as string | undefined) || (meta.file_name as string | undefined) || "";
    const head = subject ? `[${tag} · ${subject}]` : `[${tag}]`;
    const body = String(row.raw_input || row.rule_text || "").trim().slice(0, MAX_RULE_CHARS);
    if (!body) continue;
    lines.push("---", head, body);
  }
  lines.push("#END_PROPERTY_RESEARCH_INTELLIGENCE");
  return lines.join("\n");
}
