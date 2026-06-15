// _shared/system-rules.ts
// Fetches active workspace-level behavior rules from `system_intelligence_kb`
// and formats them as a `#CRITICAL_SYSTEM_PREFERENCES` block that every
// generation function can prepend to its system prompt.
//
// In-memory LRU cache (TTL 30s) keeps repeated webhook hits lightning-fast.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims => matches column
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; block: string }>();

async function embed(text: string): Promise<number[] | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 4000) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function resolveWorkspaceOwner(client: ReturnType<typeof createClient>, userId: string): Promise<string> {
  try {
    const { data } = await client
      .from("profiles")
      .select("active_workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    return (data?.active_workspace_owner_id as string | undefined) || userId;
  } catch {
    return userId;
  }
}

function formatBlock(
  rules: Array<{ rule_text: string; signal: string }>,
  license: string = "",
): string {
  const userLines = rules.map((r) => {
    const prefix =
      r.signal === "directive" ? "ALWAYS:" :
      r.signal === "negative"  ? "NEVER:"  :
      "PREFER:";
    return `- ${prefix} ${r.rule_text.trim()}`;
  });
  // HARD LAWS — injected at the TOP, always present, NEVER skippable.
  const licenseLine = license
    ? `- ALWAYS: At the very bottom of every generated post / outreach copy / property profile draft, on a new line, append exactly this footer (no markdown, no emoji): "רישיון תיווך מספר: ${license}". Do NOT add any text after the footer.`
    : `- ALWAYS: At the very bottom of every generated post / outreach copy / property profile draft, on a new line, append exactly: "רישיון תיווך מספר: [יש להזין מספר רישיון בפרופיל]". Do NOT add any text after the footer.`;
  const hardLaws = [
    `- NEVER: Include the building / house number of any property address. If the address is "ארלוזורוב 26", write only "ברחוב ארלוזורוב" or "באזור ארלוזורוב". Strip every numeric suffix from street addresses (e.g. "רחוב ויצמן 4" → "רחוב ויצמן"). This applies to posts, comments, replies, outreach copy, captions, IVR scripts, and any other text the public can see.`,
    licenseLine,
  ];
  return [
    "#CRITICAL_SYSTEM_PREFERENCES — HIGHEST PRIORITY, NON-NEGOTIABLE",
    "These are the workspace OWNER's standing orders. They OVERRIDE every persona,",
    "template, sample, channel guide, and generic best-practice in this prompt.",
    "You MUST obey every ALWAYS rule on every output and you MUST NOT violate any",
    "NEVER rule for any reason. If a rule conflicts with another instruction, the",
    "rule wins. Silently re-write your draft until it complies before returning it.",
    "",
    "## HARD COMPLIANCE LAWS (top priority, never skip):",
    ...hardLaws,
    ...(userLines.length ? ["", "## Owner-defined rules:", ...userLines] : []),
    "#END_CRITICAL_SYSTEM_PREFERENCES",
  ].join("\n");
}

/**
 * Returns a formatted system-prefs block (or "" when no active rules match).
 * Cached for 30s per (workspace, query-hash).
 */
export async function fetchSystemRulesBlock(
  userId: string | null | undefined,
  queryText: string,
  k = 8,
): Promise<string> {
  if (!userId) return "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const workspace = await resolveWorkspaceOwner(admin, userId);

  const qHash = (queryText || "").slice(0, 200).toLowerCase().replace(/\s+/g, " ").trim();
  const cacheKey = `${workspace}::${qHash}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.block;

  // Always fetch the workspace owner's broker license so the HARD LAWS block
  // can hardcode the exact footer string into the prompt.
  let license = "";
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("broker_license_number")
      .eq("id", workspace)
      .maybeSingle();
    license = String((prof?.broker_license_number ?? "")).trim();
  } catch { /* ignore */ }

  // Fast path: when no owner-defined rules exist we STILL emit the hard-laws
  // block — street-number redaction + license footer are non-negotiable.
  const { count } = await admin
    .from("system_intelligence_kb")
    .select("id", { count: "exact", head: true })
    .eq("workspace_owner_id", workspace)
    .eq("is_active", true);
  if (!count) {
    const block = formatBlock([], license);
    cache.set(cacheKey, { at: Date.now(), block });
    return block;
  }

  const vec = await embed(queryText || "general realtor reply");
  if (!vec) {
    const { data } = await admin
      .from("system_intelligence_kb")
      .select("rule_text, signal")
      .eq("workspace_owner_id", workspace)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(k);
    const block = formatBlock((data ?? []) as any, license);
    cache.set(cacheKey, { at: Date.now(), block });
    return block;
  }

  const { data, error } = await admin.rpc("match_system_rules", {
    _workspace: workspace,
    _query_embedding: vec as any,
    _k: k,
  });
  if (error) {
    const block = formatBlock([], license);
    cache.set(cacheKey, { at: Date.now(), block });
    return block;
  }
  const block = formatBlock((data ?? []) as any, license);
  cache.set(cacheKey, { at: Date.now(), block });
  return block;
}

export const SYSTEM_RULE_TRIGGERS = /(תמיד|מעכשיו|אל\s+תשתמש|אל\s+תפנה|תזכור|חוק\s+חדש|לעולם|כלל\s+חדש|מהיום|הקפד|אסור|חובה|תקפיד|always|never|from now|remember|new rule)/i;

export function hasSystemRuleTrigger(text: string | null | undefined): boolean {
  if (!text) return false;
  return SYSTEM_RULE_TRIGGERS.test(text);
}
