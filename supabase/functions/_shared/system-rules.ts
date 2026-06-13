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

function formatBlock(rules: Array<{ rule_text: string; signal: string }>): string {
  if (rules.length === 0) return "";
  const lines = rules.map((r) => {
    const prefix =
      r.signal === "directive" ? "ALWAYS:" :
      r.signal === "negative"  ? "NEVER:"  :
      "PREFER:";
    return `- ${prefix} ${r.rule_text.trim()}`;
  });
  return [
    "#CRITICAL_SYSTEM_PREFERENCES",
    "Owner-authored behavior rules. These OVERRIDE any conflicting persona, template, or generic guidance below.",
    ...lines,
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

  // Fast path: any rules at all? avoid embedding cost when workspace has none.
  const { count } = await admin
    .from("system_intelligence_kb")
    .select("id", { count: "exact", head: true })
    .eq("workspace_owner_id", workspace)
    .eq("is_active", true);
  if (!count) {
    cache.set(cacheKey, { at: Date.now(), block: "" });
    return "";
  }

  const vec = await embed(queryText || "general realtor reply");
  if (!vec) {
    // Fallback: just take top-N most recent active rules.
    const { data } = await admin
      .from("system_intelligence_kb")
      .select("rule_text, signal")
      .eq("workspace_owner_id", workspace)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(k);
    const block = formatBlock((data ?? []) as any);
    cache.set(cacheKey, { at: Date.now(), block });
    return block;
  }

  const { data, error } = await admin.rpc("match_system_rules", {
    _workspace: workspace,
    _query_embedding: vec as any,
    _k: k,
  });
  if (error) {
    cache.set(cacheKey, { at: Date.now(), block: "" });
    return "";
  }
  const block = formatBlock((data ?? []) as any);
  cache.set(cacheKey, { at: Date.now(), block });
  return block;
}

export const SYSTEM_RULE_TRIGGERS = /(תמיד|מעכשיו|אל\s+תשתמש|אל\s+תפנה|תזכור|חוק\s+חדש|לעולם|כלל\s+חדש|מהיום|הקפד|אסור|חובה|תקפיד|always|never|from now|remember|new rule)/i;

export function hasSystemRuleTrigger(text: string | null | undefined): boolean {
  if (!text) return false;
  return SYSTEM_RULE_TRIGGERS.test(text);
}
