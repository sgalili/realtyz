// Human-readable, fully detailed Facebook Graph failure description.
//
// Every Facebook sync surface returns this object so the UI can show the exact
// Graph reason (code, subcode, type, message, trace id) instead of a silent or
// generic failure.

export type MetaErrorDetail = {
  code: number | null;
  subcode: number | null;
  type: string | null;
  message: string | null;
  fbtrace_id: string | null;
  http_status: number | null;
  /** Machine category used by the client to decide how to react. */
  kind: "token_expired" | "missing_scope" | "rate_limited" | "network" | "no_connection" | "unknown";
  /** Hebrew, user-facing sentence including the exact Graph details. */
  message_he: string;
  /**
   * True when the refusal looks like the Meta app still being in Development
   * Mode / lacking Advanced Access (unverified business), rather than the user
   * simply unticking a checkbox in the consent dialog.
   */
  dev_mode_restricted: boolean;
  /** Developer-facing Hebrew instructions for the Development Mode case. */
  dev_note_he: string | null;
};

const DEV_MODE_RE =
  /development mode|dev mode|advanced access|standard access|not been approved|has not been approved|not approved for|app review|unverified|business verification|verify your business|does not have permission to access/i;

export const META_DEV_MODE_NOTE_HE = [
  "הערה למפתח: נראה שאפליקציית Meta נמצאת במצב פיתוח (Development Mode) או שההרשאה מוגבלת ל-Standard Access.",
  "במצב הזה חשבון הפייסבוק המחובר חייב להיות רשום באפליקציה ב-developers.facebook.com בתפקיד Administrator, Developer או Tester (App roles > Roles), ולאשר את ההזמנה.",
  "בנוסף יש להפעיל את ההרשאה pages_read_engagement לפיתוח (App review > Permissions and features), ולהתחבר מחדש כדי לקבל טוקן חדש.",
  "לגישה של חשבונות שאינם Testers נדרשת אימות עסקי (Business Verification) ו-App Review לקבלת Advanced Access.",
].join(" ");

function pick(raw: unknown): Record<string, any> {
  const any = raw as any;
  if (!any) return {};
  if (typeof any === "string") return { message: any };
  return (any.error ?? any) as Record<string, any>;
}

/** Build a precise, descriptive failure object from a Graph error payload. */
export function describeMetaError(raw: unknown, httpStatus?: number | null): MetaErrorDetail {
  const err = pick(raw);
  const code = Number(err?.code ?? 0) || null;
  const subcode = Number(err?.error_subcode ?? 0) || null;
  const type = err?.type ? String(err.type) : null;
  const message = err?.message ? String(err.message) : (typeof raw === "string" ? raw : null);
  const fbtrace = err?.fbtrace_id ? String(err.fbtrace_id) : null;
  const text = String(message ?? "");

  let kind: MetaErrorDetail["kind"] = "unknown";
  if (raw === "facebook_page_access_token_missing") kind = "no_connection";
  else if (text === "graph_network_error" || /network|timeout|timed out|fetch failed/i.test(text)) kind = "network";
  else if (code === 190 || subcode === 463 || subcode === 467 || /expired|session has been invalidated|re-?authenticat/i.test(text)) kind = "token_expired";
  else if (code === 10 || code === 200 || code === 3 || /pages_read_engagement|pages_show_list|permission|Page Public Content Access/i.test(text)) kind = "missing_scope";
  else if (code === 4 || code === 17 || code === 32 || code === 613 || httpStatus === 429 || /rate limit|too many calls/i.test(text)) kind = "rate_limited";

  const head = kind === "no_connection"
    ? "לא נמצא חיבור פעיל לעמוד הפייסבוק. יש להתחבר מחדש בהגדרות הערוצים."
    : kind === "token_expired"
      ? "תוקף ההרשאה לעמוד הפייסבוק פג. יש להתחבר מחדש לעמוד."
      : kind === "missing_scope"
        ? "חסרה הרשאת קריאה לעמוד (pages_read_engagement). יש להתחבר מחדש ולאשר את ההרשאה."
        : kind === "rate_limited"
          ? "פייסבוק חסם זמנית את קריאות ה-API בגלל מגבלת קצב. אפשר לנסות שוב בעוד כמה דקות."
          : kind === "network"
            ? "הקריאה לפייסבוק לא הושלמה בגלל תקלת רשת או timeout."
            : "הסנכרון מפייסבוק נכשל.";

  const parts: string[] = [];
  if (message && kind !== "no_connection") parts.push(`פירוט מפייסבוק: ${message}`);
  const codes = [
    code !== null ? `code ${code}` : null,
    subcode !== null ? `subcode ${subcode}` : null,
    type ? `type ${type}` : null,
    httpStatus ? `HTTP ${httpStatus}` : null,
    fbtrace ? `trace ${fbtrace}` : null,
  ].filter(Boolean).join(", ");
  if (codes) parts.push(`(${codes})`);

  // Code 10 ("application does not have permission for this action") is the
  // signature refusal while the app is still in Development Mode / limited to
  // Standard Access, so the tester-role note is the actionable fix.
  const devModeRestricted = kind === "missing_scope" && (code === 10 || DEV_MODE_RE.test(text));

  return {
    code,
    subcode,
    type,
    message,
    fbtrace_id: fbtrace,
    http_status: httpStatus ?? null,
    kind,
    message_he: [head, ...parts].join(" "),
    dev_mode_restricted: devModeRestricted,
    dev_note_he: devModeRestricted ? META_DEV_MODE_NOTE_HE : null,
  };
}
