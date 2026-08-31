// CRM JSON import: receives a broker's JSON file (contacts / properties),
// validates it, maps every field to the real schema and MERGES it in.
// Never deletes, never overwrites a stored value with null.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { importCrmJson, reportToHebrew } from "../_shared/crmJsonImport.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Decodes either raw JSON, a JSON string, or a data: URL holding JSON. */
function decodePayload(body: any): unknown {
  if (body?.payload !== undefined) return body.payload;
  if (typeof body?.json_text === "string") return body.json_text;
  const dataUrl: string | undefined = body?.data_url;
  if (typeof dataUrl === "string" && dataUrl.includes(",")) {
    const [meta, data] = dataUrl.split(",", 2);
    if (/;base64/i.test(meta)) {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(data);
  }
  if (body?.records || body?.contacts || body?.properties) return body;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));

    let ownerId: string | null = null;
    if (bearer && bearer === SERVICE_KEY) {
      ownerId = body?.workspace_owner_id ? String(body.workspace_owner_id) : null;
    } else if (bearer) {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await authClient.auth.getUser();
      ownerId = data?.user?.id ?? null;
    }
    if (!ownerId) return json({ error: "unauthorized" }, 401);

    // Active workspace wins over the personal id.
    try {
      const { data: prof } = await admin
        .from("profiles").select("active_workspace_owner_id").eq("id", ownerId).maybeSingle();
      if (prof?.active_workspace_owner_id) ownerId = String(prof.active_workspace_owner_id);
    } catch { /* fall back to the personal id */ }

    let raw = decodePayload(body);
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); }
      catch (e) {
        return json({
          error: "invalid_json",
          message: "הקובץ אינו JSON תקין: " + (e as Error).message,
        }, 400);
      }
    }
    if (!raw || typeof raw !== "object") {
      return json({ error: "empty_payload", message: "לא קיבלתי תוכן JSON לייבוא." }, 400);
    }

    const report = await importCrmJson(admin, ownerId, raw, { dry_run: !!body?.dry_run });
    return json({ ...report, summary: reportToHebrew(report) }, report.ok ? 200 : 400);
  } catch (e) {
    console.error("crm-json-import error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
