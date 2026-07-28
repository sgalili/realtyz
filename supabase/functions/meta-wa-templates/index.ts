/**
 * meta-wa-templates
 * ─────────────────
 * Returns the workspace's APPROVED Meta WhatsApp message templates so the UI
 * can force template-based initiation (24-hour window compliance).
 *
 * Read-only. Credentials are resolved workspace-wide from `wa_providers`
 * (provider_name='WBA') with env fallbacks, exactly like meta-wa-health.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const DEFAULT_API_VERSION = "v21.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type TemplateOut = {
  name: string;
  language: string;
  category: string | null;
  status: string;
  body_text: string;
  variable_count: number;
  has_header_variable: boolean;
};

/** Count {{1}}, {{2}} … placeholders in a template body. */
function countVariables(text: string): number {
  const found = new Set<number>();
  for (const m of String(text).matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    found.add(Number(m[1]));
  }
  return found.size;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  try {
    // Settings are shared workspace-wide → resolve the owner's row.
    let ownerId = userId;
    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    const owner = ((prof as any)?.active_workspace_owner_id ??
      (prof as any)?.workspace_owner_id) as string | null;
    if (owner) ownerId = owner;

    const { data: row } = await admin
      .from("wa_providers")
      .select("config")
      .eq("user_id", ownerId)
      .eq("provider_name", "WBA")
      .maybeSingle();

    const cfg = ((row?.config as Record<string, unknown>) ?? {});
    const wabaId = String(cfg.waba_id ?? Deno.env.get("META_WABA_ID") ?? "").trim();
    const accessToken = String(
      cfg.access_token ?? Deno.env.get("META_WA_ACCESS_TOKEN") ??
        Deno.env.get("META_WHATSAPP_TOKEN") ?? "",
    ).trim();
    const apiVersion = String(cfg.api_version ?? DEFAULT_API_VERSION);

    if (!wabaId || !accessToken) {
      return json({
        success: false,
        templates: [],
        error:
          "חסרים פרטי חיבור ל-Meta (WABA ID / Access Token) — יש להשלים אותם בהגדרות WhatsApp Business API.",
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?limit=200&fields=name,language,status,category,components`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await res.json().catch(() => ({} as any));

    if (!res.ok || data?.error) {
      const err = data?.error ?? {};
      return json({
        success: false,
        templates: [],
        error: err?.message
          ? `שליפת התבניות מ-Meta נכשלה: ${err.message}`
          : "שליפת התבניות מ-Meta נכשלה — בדוק את הרשאות הטוקן (whatsapp_business_management).",
        details: {
          code: err?.code ?? null,
          subcode: err?.error_subcode ?? null,
          type: err?.type ?? null,
        },
      });
    }

    const templates: TemplateOut[] = (Array.isArray(data?.data) ? data.data : [])
      .map((t: any) => {
        const components: any[] = Array.isArray(t?.components) ? t.components : [];
        const bodyComp = components.find((c) => String(c?.type).toUpperCase() === "BODY");
        const headerComp = components.find((c) => String(c?.type).toUpperCase() === "HEADER");
        const bodyText = String(bodyComp?.text ?? "");
        return {
          name: String(t?.name ?? ""),
          language: String(t?.language ?? ""),
          category: t?.category ?? null,
          status: String(t?.status ?? ""),
          body_text: bodyText,
          variable_count: countVariables(bodyText),
          has_header_variable: countVariables(String(headerComp?.text ?? "")) > 0,
        };
      })
      .filter((t: TemplateOut) => t.name);

    const approved = templates.filter((t) => t.status.toUpperCase() === "APPROVED");

    return json({
      success: true,
      templates: approved,
      all_count: templates.length,
      approved_count: approved.length,
    });
  } catch (e) {
    return json({
      success: false,
      templates: [],
      error: e instanceof Error ? `שגיאה בשליפת התבניות: ${e.message}` : "שגיאה בשליפת התבניות",
    }, 500);
  }
});
