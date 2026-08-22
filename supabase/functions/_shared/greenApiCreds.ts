/**
 * Green API credential resolution shared by the inbound webhook and the
 * avatar-sync helper.
 *
 * Resolution order (first hit wins):
 *   1. workspace_whatsapp_settings  (per-workspace QR session — the modern path)
 *   2. api_configs  "Green API"     ("instanceId:token" legacy single row)
 *   3. social_connections           (whatsapp_green legacy row)
 *   4. env GREEN_API_INSTANCE_ID / GREEN_API_TOKEN
 */

export interface GreenCreds {
  instance_id: string;
  token: string;
  owner_id: string | null;
  source: "workspace_settings" | "api_configs" | "social_connections" | "env";
}

const clean = (v: unknown) => String(v ?? "").trim();

function splitPair(raw: unknown): { instance_id: string; token: string } | null {
  const value = clean(raw);
  if (!value.includes(":")) return null;
  const [instance, ...rest] = value.split(":");
  const token = rest.join(":").trim();
  if (!instance.trim() || !token) return null;
  return { instance_id: instance.trim(), token };
}

/** Resolve credentials, preferring the given workspace owner when provided. */
export async function resolveGreenCreds(
  admin: any,
  ownerId?: string | null,
): Promise<GreenCreds | null> {
  // 1. workspace_whatsapp_settings
  try {
    let q = admin
      .from("workspace_whatsapp_settings")
      .select("workspace_owner_id, green_api_instance_id, green_api_token, qr_status, updated_at")
      .not("green_api_instance_id", "is", null)
      .not("green_api_token", "is", null)
      .order("updated_at", { ascending: false });
    if (ownerId) q = q.eq("workspace_owner_id", ownerId);
    const { data } = await q.limit(5);
    const rows = (data ?? []) as any[];
    const best = rows.find((r) => r.qr_status === "connected") ?? rows[0];
    if (best?.green_api_instance_id && best?.green_api_token) {
      return {
        instance_id: clean(best.green_api_instance_id),
        token: clean(best.green_api_token),
        owner_id: best.workspace_owner_id ?? null,
        source: "workspace_settings",
      };
    }
  } catch { /* silent */ }

  // 2. api_configs
  try {
    const { data } = await admin
      .from("api_configs")
      .select("api_key, user_id, is_active")
      .eq("service_name", "Green API")
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as any;
    const pair = splitPair(row?.api_key);
    if (pair) {
      return { ...pair, owner_id: row?.user_id ?? null, source: "api_configs" };
    }
  } catch { /* silent */ }

  // 3. social_connections
  try {
    const { data } = await admin
      .from("social_connections")
      .select("credentials, user_id")
      .eq("platform", "whatsapp_green")
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as any;
    const creds = (row?.credentials ?? {}) as Record<string, any>;
    const manual = (creds.manual ?? {}) as Record<string, any>;
    const instance_id = clean(manual.instance_id ?? creds.instance_id ?? creds.instanceId);
    const token = clean(manual.api_token ?? manual.token ?? creds.api_token ?? creds.token);
    if (instance_id && token) {
      return { instance_id, token, owner_id: row?.user_id ?? null, source: "social_connections" };
    }
  } catch { /* silent */ }

  // 4. env
  const envInstance = clean(Deno.env.get("GREEN_API_INSTANCE_ID"));
  const envToken = clean(Deno.env.get("GREEN_API_TOKEN"));
  if (envInstance && envToken) {
    return { instance_id: envInstance, token: envToken, owner_id: ownerId ?? null, source: "env" };
  }

  return null;
}

/** Locate the workspace owner that owns a given Green API instance id. */
export async function ownerForInstance(admin: any, instanceId: string): Promise<string | null> {
  const id = clean(instanceId);
  if (!id) return null;
  try {
    const { data } = await admin
      .from("workspace_whatsapp_settings")
      .select("workspace_owner_id")
      .eq("green_api_instance_id", id)
      .maybeSingle();
    if ((data as any)?.workspace_owner_id) return String((data as any).workspace_owner_id);
  } catch { /* silent */ }
  try {
    const { data } = await admin
      .from("api_configs")
      .select("user_id, api_key")
      .eq("service_name", "Green API")
      .limit(20);
    const match = ((data ?? []) as any[]).find((r) => clean(r.api_key).startsWith(`${id}:`));
    if (match?.user_id) return String(match.user_id);
  } catch { /* silent */ }
  return null;
}

/** Normalize an Israeli/international phone to digits-only international form. */
export function toIntlDigits(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/** Silent Green API avatar lookup — never throws. */
export async function fetchGreenAvatar(
  creds: { instance_id: string; token: string },
  chatId: string,
): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12_000);
    const res = await fetch(
      `https://api.green-api.com/waInstance${creds.instance_id}/getAvatar/${creds.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
        signal: ctl.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => ({}));
    const url = clean(data?.urlAvatar);
    return url && data?.available !== false ? url : null;
  } catch {
    return null;
  }
}
