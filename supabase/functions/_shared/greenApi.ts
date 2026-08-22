/**
 * Green API (QR-session WhatsApp) shared helpers.
 *
 * Used by workspaces whose `workspace_whatsapp_settings.connection_type` is
 * 'qr_session' — their own personal number is linked by scanning a QR code, and
 * outbound text messages go through `waInstance{id}/sendMessage/{token}`.
 */

export interface GreenApiCreds {
  instance_id: string;
  token: string;
}

const BASE = "https://api.green-api.com";

const url = (creds: GreenApiCreds, method: string) =>
  `${BASE}/waInstance${creds.instance_id}/${method}/${creds.token}`;

export type GreenQrStatus = "disconnected" | "pending" | "connected" | "error";

/** Green API instance state → our QR status enum. */
export function mapStateToStatus(state: string | undefined, ok: boolean): GreenQrStatus {
  if (!ok) return "error";
  if (state === "authorized") return "connected";
  if (state === "notAuthorized" || state === "starting" || state === "sleepMode") return "pending";
  if (state === "blocked" || state === "yellowCard") return "error";
  return "pending";
}

/** Read the live instance state (authorized / notAuthorized / blocked ...). */
export async function getStateInstance(creds: GreenApiCreds) {
  const res = await fetch(url(creds, "getStateInstance"));
  const data = await res.json().catch(() => ({}));
  const state = (data as any)?.stateInstance as string | undefined;
  return { ok: res.ok, status: mapStateToStatus(state, res.ok), state: state ?? null, raw: data };
}

/** Phone number (wid) currently linked to the instance, digits only. */
export async function getLinkedPhone(creds: GreenApiCreds): Promise<string | null> {
  try {
    const res = await fetch(url(creds, "getWaSettings"));
    const data: any = await res.json().catch(() => ({}));
    const digits = String(data?.wid ?? data?.phone ?? "").replace(/\D/g, "");
    return digits || null;
  } catch {
    return null;
  }
}

/**
 * Fetch a fresh QR code. Green API returns either a base64 PNG
 * (`type: 'qrCode'`) or `type: 'alreadyLogged'` when the number is linked.
 */
export async function getQrCode(creds: GreenApiCreds): Promise<
  | { kind: "qr"; image: string }
  | { kind: "already_logged" }
  | { kind: "error"; message: string }
> {
  try {
    const res = await fetch(url(creds, "qr"));
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { kind: "error", message: String(data?.message ?? `HTTP ${res.status}`) };
    if (data?.type === "qrCode" && data?.message) {
      return { kind: "qr", image: `data:image/png;base64,${data.message}` };
    }
    if (data?.type === "alreadyLogged") return { kind: "already_logged" };
    return { kind: "error", message: String(data?.message ?? "QR unavailable") };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Log the instance out so a new number can be linked by QR. */
export async function logoutInstance(creds: GreenApiCreds): Promise<boolean> {
  try {
    const res = await fetch(url(creds, "logout"), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a plain text message via Green API.
 * `phone` must be digits only in international form (e.g. 9725XXXXXXXX).
 */
export async function sendGreenApiText(
  creds: GreenApiCreds,
  phone: string,
  message: string,
): Promise<{ success: boolean; message_id: string | null; error?: string; details?: unknown }> {
  if (!creds.instance_id || !creds.token) {
    return { success: false, message_id: null, error: "Green API not configured" };
  }
  try {
    const res = await fetch(url(creds, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message_id: null,
        error: `Green API send failed (${res.status})`,
        details: data,
      };
    }
    return { success: true, message_id: String(data?.idMessage ?? "") || null };
  } catch (error) {
    return {
      success: false,
      message_id: null,
      error: "Green API network request failed",
      details: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Send a file by URL via Green API (used for image/document attachments).
 */
export async function sendGreenApiFileByUrl(
  creds: GreenApiCreds,
  phone: string,
  fileUrl: string,
  fileName: string,
  caption?: string,
): Promise<{ success: boolean; message_id: string | null; error?: string; details?: unknown }> {
  try {
    const res = await fetch(url(creds, "sendFileByUrl"), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        chatId: `${phone}@c.us`,
        urlFile: fileUrl,
        fileName,
        caption: caption ?? "",
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message_id: null, error: `Green API file send failed (${res.status})`, details: data };
    }
    return { success: true, message_id: String(data?.idMessage ?? "") || null };
  } catch (error) {
    return {
      success: false,
      message_id: null,
      error: "Green API network request failed",
      details: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}
