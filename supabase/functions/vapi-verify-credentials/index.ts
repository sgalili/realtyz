// Vapi credentials verification — reads the user-saved key from `api_configs`
// (service_name='Vapi', colon-joined as `${API_KEY}:${PHONE_NUMBER_ID}:${ASSISTANT_ID}`)
// and pings Vapi's GET /assistant to confirm a HTTP 200 handshake.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: rows } = await sb.from("api_configs").select("service_name, api_key");
    const vapiRow = (rows ?? []).find((r: any) => r.service_name === "Vapi");
    const twilioRow = (rows ?? []).find((r: any) => r.service_name === "Twilio");

    const [vapiKey, vapiPhoneId, vapiAssistantId] = String(vapiRow?.api_key ?? "").split(":");
    const [twSid, twToken, twNumber] = String(twilioRow?.api_key ?? "").split(":");

    const result: Record<string, unknown> = {
      vapi: { ok: false, message: "", phoneNumberId: vapiPhoneId ?? null, assistantId: vapiAssistantId ?? null },
      twilio: { ok: false, message: "", number: twNumber ?? null },
    };

    // --- Vapi /assistant probe ---
    if (!vapiKey) {
      (result.vapi as any).message = "שגיאת התחברות — בדוק את מפתחות ה-API שלך";
    } else {
      const r = await fetch("https://api.vapi.ai/assistant?limit=1", {
        headers: { Authorization: `Bearer ${vapiKey}` },
      });
      const body = await r.text();
      (result.vapi as any).ok = r.ok;
      (result.vapi as any).status = r.status;
      (result.vapi as any).message = r.ok
        ? "Vapi מחובר בהצלחה"
        : `שגיאת התחברות — בדוק את מפתחות ה-API שלך (HTTP ${r.status})`;
      if (!r.ok) (result.vapi as any).body = body.slice(0, 400);
    }

    // --- Twilio /Accounts probe ---
    if (!twSid || !twToken) {
      (result.twilio as any).message = "חסר Account SID או Auth Token";
    } else {
      const basic = btoa(`${twSid}:${twToken}`);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twSid}.json`, {
        headers: { Authorization: `Basic ${basic}` },
      });
      (result.twilio as any).ok = r.ok;
      (result.twilio as any).status = r.status;
      (result.twilio as any).message = r.ok
        ? "Twilio מחובר בהצלחה"
        : `שגיאת התחברות — בדוק את מפתחות ה-API שלך (HTTP ${r.status})`;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
