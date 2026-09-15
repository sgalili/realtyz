// Workspace-isolated 019 SMS gateway helper.
//
// Every workspace can own its OWN 019 credentials + sender number in
// public.workspace_sms_settings. Resolution order is strictly:
//   1. the workspace's own active row (full isolation between workspaces)
//   2. the shared platform row in api_configs ("019 SMS") as a last resort
//
// AUTH: 019 no longer issues API passwords — the account owner generates an API
// TOKEN on the 019 website. The token is sent as `Authorization: Bearer <token>`
// together with the username in the XML envelope. Legacy password rows keep
// working (password element) until they are migrated.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type Sms019Config = {
  username: string;
  /** API token generated on the 019 website (preferred). */
  token: string | null;
  /** Legacy API password, used only when no token exists. */
  password: string | null;
  sender: string;
  /** 'workspace' when the workspace's own 019 number was used. */
  scope: "workspace" | "platform";
};

const escapeXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * 05XXXXXXXX local form required by the 019 XML API. Accepts every shape a
 * number can arrive in: 0546811841, 972546811841, +972-54-681-1841,
 * 00972546811841 and the bare 546811841.
 */
export function toLocalIL(phone: string): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^9725\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return null;
}

const clean = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** `<user>` element + optional Bearer header for the resolved credentials. */
export function sms019Auth(cfg: Sms019Config): { userXml: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    "Content-Type": "application/xml; charset=UTF-8",
  };
  if (cfg.token) {
    headers.Authorization = `Bearer ${cfg.token}`;
    return { userXml: `<user><username>${escapeXml(cfg.username)}</username></user>`, headers };
  }
  return {
    userXml:
      `<user><username>${escapeXml(cfg.username)}</username><password>${escapeXml(cfg.password ?? "")}</password></user>`,
    headers,
  };
}

export async function resolveSms019Config(
  admin: SupabaseClient,
  workspaceOwnerId: string | null | undefined,
): Promise<Sms019Config | null> {
  // A workspace override only wins when it is COMPLETE (user + token/password +
  // approved sender). Otherwise every workspace falls back to the global
  // Realtyz 019 gateway so OTP/SMS always ships.
  if (workspaceOwnerId) {
    const { data } = await admin
      .from("workspace_sms_settings")
      .select("username, token, password, sender_id, is_active")
      .eq("workspace_owner_id", workspaceOwnerId)
      .maybeSingle();
    const row: any = data;
    const token = clean(row?.token);
    const password = clean(row?.password);
    if (
      row?.is_active !== false && clean(row?.username) && (token || password) &&
      clean(row?.sender_id)
    ) {
      return {
        username: String(row.username).trim(),
        token,
        password,
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
      // Shared row stores `username:secret[:sender]`; the secret is a token on
      // modern accounts, so send it as a Bearer token.
      token: parts[1],
      password: parts[1],
      sender: (parts.slice(2).join(":") || "").trim(),
      scope: "platform",
    };
  }

  // Last resort: the platform-wide Realtyz 019 credentials from env secrets.
  const envUser = Deno.env.get("SMS019_USERNAME")?.trim();
  const envToken = Deno.env.get("SMS019_TOKEN")?.trim();
  const envPass = Deno.env.get("SMS019_PASSWORD")?.trim();
  const envSender = Deno.env.get("SMS019_SENDER")?.trim();
  if (envUser && (envToken || envPass)) {
    return {
      username: envUser,
      token: envToken ?? null,
      password: envPass ?? null,
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

  const auth = sms019Auth(cfg);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  ${auth.userXml}
  <source>${escapeXml(cfg.sender)}</source>
  <destinations><phone>${escapeXml(local)}</phone></destinations>
  <message>${escapeXml(body)}</message>
</sms>`;

  let res = await fetch("https://www.019sms.co.il:8090/api", {
    method: "POST",
    headers: auth.headers,
    body: xml,
  });
  let text = await res.text();
  let status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);

  // Token accounts that still hold a legacy password: retry once the other way
  // so an in-progress credential migration never blocks a send.
  if (status !== 0 && cfg.token && cfg.password && cfg.token !== cfg.password) {
    const legacy = sms019Auth({ ...cfg, token: null });
    res = await fetch("https://www.019sms.co.il:8090/api", {
      method: "POST",
      headers: legacy.headers,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  ${legacy.userXml}
  <source>${escapeXml(cfg.sender)}</source>
  <destinations><phone>${escapeXml(local)}</phone></destinations>
  <message>${escapeXml(body)}</message>
</sms>`,
    });
    text = await res.text();
    status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);
  }

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

/**
 * Account balance for the resolved credentials. Used by the "בדיקה" button to
 * prove the workspace credentials authenticate against 019 before any send.
 */
export async function sms019Balance(
  cfg: Sms019Config,
): Promise<{ ok: boolean; balance?: string | null; error?: string; raw?: string }> {
  const attempt = async (useToken: boolean) => {
    const auth = sms019Auth(useToken ? cfg : { ...cfg, token: null });
    const res = await fetch("https://www.019sms.co.il:8090/api", {
      method: "POST",
      headers: auth.headers,
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<balance>\n  ${auth.userXml}\n</balance>`,
    });
    const text = await res.text();
    return {
      status: parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10),
      balance: text.match(/<balance>(\d+)<\/balance>/)?.[1] ?? null,
      message: text.match(/<message>(.*?)<\/message>/)?.[1] ?? null,
      text,
    };
  };

  let r = await attempt(!!cfg.token);
  if (r.status !== 0 && cfg.token && cfg.password && cfg.token !== cfg.password) {
    r = await attempt(false);
  }
  if (r.status === 0) return { ok: true, balance: r.balance, raw: r.text };
  return { ok: false, error: r.message || `019 status ${r.status}`, raw: r.text };
}
