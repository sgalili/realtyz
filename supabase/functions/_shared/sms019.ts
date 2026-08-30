// Workspace-isolated 019 SMS gateway helper.
//
// Every workspace can own its OWN 019 credentials + sender number in
// public.workspace_sms_settings. Resolution order is strictly:
//   1. the workspace's own active row (full isolation between workspaces)
//   2. the shared platform row in api_configs ("019 SMS") as a last resort
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type Sms019Config = {
  username: string;
  password: string;
  sender: string;
  /** 'workspace' when the workspace's own 019 number was used. */
  scope: "workspace" | "platform";
};

const escapeXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** 05XXXXXXXX local form required by the 019 XML API. */
export function toLocalIL(phone: string): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^9725\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}

export async function resolveSms019Config(
  admin: SupabaseClient,
  workspaceOwnerId: string | null | undefined,
): Promise<Sms019Config | null> {
  // A workspace override only wins when it is COMPLETE (user + password +
  // approved sender). Otherwise every workspace falls back to the global
  // Realtyz 019 gateway so OTP/SMS always ships.
  if (workspaceOwnerId) {
    const { data } = await admin
      .from("workspace_sms_settings")
      .select("username, password, sender_id, is_active")
      .eq("workspace_owner_id", workspaceOwnerId)
      .maybeSingle();
    const row: any = data;
    if (
      row?.is_active !== false && row?.username && row?.password &&
      String(row?.sender_id ?? "").trim()
    ) {
      return {
        username: String(row.username),
        password: String(row.password),
        sender: String(row.sender_id).trim(),
        scope: "workspace",
      };
    }
  }

  const { data: shared } = await admin
    .from("api_configs")
    .select("api_key")
    .eq("service_name", "019 SMS")
    .eq("is_active", true)
    .maybeSingle();
  const parts = String((shared as any)?.api_key || "").split(":");
  if (parts[0] && parts[1]) {
    return {
      username: parts[0],
      password: parts[1],
      sender: (parts.slice(2).join(":") || "").trim(),
      scope: "platform",
    };
  }

  // Last resort: the platform-wide Realtyz 019 credentials from env secrets.
  const envUser = Deno.env.get("SMS019_USERNAME")?.trim();
  const envPass = Deno.env.get("SMS019_PASSWORD")?.trim();
  const envSender = Deno.env.get("SMS019_SENDER")?.trim();
  if (envUser && envPass) {
    return {
      username: envUser,
      password: envPass,
      sender: envSender ?? "",
      scope: "platform",
    };
  }
  return null;
}


export async function sendSms019(
  admin: SupabaseClient,
  phone: string,
  body: string,
  workspaceOwnerId?: string | null,
): Promise<{ ok: boolean; provider?: string; message_id?: string | null; error?: string; scope?: string }> {
  const local = toLocalIL(phone);
  if (!local) return { ok: false, error: "מספר טלפון לא תקין" };

  const cfg = await resolveSms019Config(admin, workspaceOwnerId ?? null);
  if (!cfg) return { ok: false, error: "019 SMS לא מוגדר" };
  if (!cfg.sender) {
    return {
      ok: false,
      error:
        "019 SMS: חסר שולח (Sender ID) מאושר. הזן בהגדרות את מספר ה-019 של מרחב העבודה שרשום כ-SMS-capable.",
    };
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user><username>${escapeXml(cfg.username)}</username><password>${escapeXml(cfg.password)}</password></user>
  <source>${escapeXml(cfg.sender)}</source>
  <destinations><phone>${escapeXml(local)}</phone></destinations>
  <message>${escapeXml(body)}</message>
</sms>`;

  const res = await fetch("https://www.019sms.co.il:8090/api", {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body: xml,
  });
  const text = await res.text();
  const status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);
  if (status === 0) {
    return {
      ok: true,
      provider: "019 SMS",
      message_id: text.match(/<message_id>(.*?)<\/message_id>/)?.[1] ?? null,
      scope: cfg.scope,
    };
  }
  return { ok: false, error: text.match(/<message>(.*?)<\/message>/)?.[1] || `019 status ${status}`, scope: cfg.scope };
}
