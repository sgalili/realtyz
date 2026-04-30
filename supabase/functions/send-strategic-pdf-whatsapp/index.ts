// createClient no longer needed — all WhatsApp sends route through send-whatsapp.
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

    // Route via unified send-whatsapp gateway (text + PDF attachment in one call).
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("Authorization") ?? `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        phone_number: phone,
        message: parsed.data.message,
        file: {
          base64: parsed.data.pdf_base64,
          file_name: parsed.data.file_name,
          caption: "דוח אסטרטגי Realtyz AI",
          mime_type: "application/pdf",
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.success) {
      return json({ error: "שליחת WhatsApp נכשלה", details: body }, 502);
    }

    return json({ success: true, message_id: body.message_id ?? null });
  } catch (error) {
    console.error("send strategic pdf whatsapp error", error);
    return json({ error: error instanceof Error ? error.message : "שגיאת שרת" }, 500);
  }
});