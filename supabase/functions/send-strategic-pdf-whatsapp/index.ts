import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { corsHeaders } from "../_shared/cors.ts";

const BodySchema = z.object({
  phone_number: z.string().min(8).max(20),
  message: z.string().min(1).max(3000),
  file_name: z.string().min(1).max(120).default("kalpiz-strategic-report.pdf"),
  pdf_base64: z.string().min(100),
});

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizeIsraeliPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const phone = normalizeIsraeliPhone(parsed.data.phone_number);
    if (!phone) return json({ error: "מספר WhatsApp לא תקין" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: config } = await admin.from("api_configs").select("api_key").eq("service_name", "Green API").eq("is_active", true).maybeSingle();
    const [instanceId, ...tokenParts] = String(config?.api_key ?? "").split(":");
    const token = tokenParts.join(":");
    if (!instanceId || !token) return json({ error: "Green API לא מוגדר" }, 500);

    const chatId = `${phone}@c.us`;
    const messageResponse = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message: parsed.data.message }),
    });
    if (!messageResponse.ok) return json({ error: "שליחת הודעת WhatsApp נכשלה", details: await messageResponse.text() }, 502);

    const pdfBytes = Uint8Array.from(atob(parsed.data.pdf_base64), (char) => char.charCodeAt(0));
    const form = new FormData();
    form.append("chatId", chatId);
    form.append("caption", "דוח אסטרטגי Kalpiz AI");
    form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), parsed.data.file_name);

    const fileResponse = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendFileByUpload/${token}`, {
      method: "POST",
      body: form,
    });
    if (!fileResponse.ok) return json({ error: "שליחת קובץ PDF נכשלה", details: await fileResponse.text() }, 502);

    return json({ success: true });
  } catch (error) {
    console.error("send strategic pdf whatsapp error", error);
    return json({ error: error instanceof Error ? error.message : "שגיאת שרת" }, 500);
  }
});