/**
 * Turns raw Google API failures into calm Hebrew copy.
 *
 * The most common real-world failure is a Google Cloud project where the
 * specific API was never enabled. Google answers with a long English sentence
 * ("Calendar API has not been used in project 123 before or it is disabled...")
 * plus a console URL. Showing that verbatim looks like a crash, so we translate
 * it and hand the console link back as a real button.
 */

export type GoogleServiceKey = 'gmail' | 'google_calendar' | 'youtube' | 'google_drive' | 'google_all';

export type FriendlyGoogleError = {
  /** Short Hebrew headline. */
  title: string;
  /** Hebrew explanation of what the user (or the workspace admin) should do. */
  message: string;
  /** Google Cloud Console URL that enables the missing API, when Google gave one. */
  enableUrl: string | null;
  /** True when the root cause is a disabled / never-enabled Google API. */
  apiDisabled: boolean;
  /** The original provider text, kept for the collapsible technical line. */
  raw: string;
};

const SERVICE_LABEL: Record<string, string> = {
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  youtube: 'YouTube',
  google_drive: 'Google Drive',
  google_all: 'שירותי Google',
};

/** Console overview pages, used when Google did not include a link itself. */
const CONSOLE_FALLBACK: Record<string, string> = {
  gmail: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  google_calendar: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
  youtube: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  google_drive: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
  google_all: 'https://console.cloud.google.com/apis/dashboard',
};

/** Detects the "API has not been used ... or it is disabled" family of errors. */
export function isGoogleApiDisabled(raw: string): boolean {
  const t = raw.toLowerCase();
  return (
    t.includes('has not been used in project')
    || t.includes('it is disabled')
    || t.includes('accessnotconfigured')
    || t.includes('service_disabled')
    || t.includes('api is not enabled')
  );
}

/** Pulls the console "Enable it by visiting <url>" link out of Google's text. */
export function extractEnableUrl(raw: string): string | null {
  const m = raw.match(/https?:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"'),]+/i);
  return m ? m[0] : null;
}

export function friendlyGoogleError(raw: unknown, platform?: string): FriendlyGoogleError {
  const text = String((raw as { message?: unknown })?.message ?? raw ?? '').trim() || 'unknown';
  const label = SERVICE_LABEL[platform ?? ''] ?? 'שירותי Google';

  if (isGoogleApiDisabled(text)) {
    return {
      title: `ה-API של ${label} אינו מופעל`,
      message:
        `החיבור אושר, אבל ה-API של ${label} עדיין לא מופעל בפרויקט Google Cloud. `
        + 'יש להפעיל אותו בקונסולה של Google, להמתין כדקה ואז ללחוץ "נסה שוב".',
      enableUrl: extractEnableUrl(text) ?? CONSOLE_FALLBACK[platform ?? ''] ?? CONSOLE_FALLBACK.google_all,
      apiDisabled: true,
      raw: text,
    };
  }

  if (/redirect_uri/i.test(text)) {
    return {
      title: 'כתובת ההחזרה אינה מאושרת',
      message: 'Google דחה את כתובת ההחזרה. יש להוסיף אותה לרשימת Authorized redirect URIs בקונסולה של Google.',
      enableUrl: 'https://console.cloud.google.com/apis/credentials',
      apiDisabled: false,
      raw: text,
    };
  }

  if (/access_denied|user_cancel|cancelled/i.test(text)) {
    return {
      title: 'החיבור בוטל',
      message: 'לא ניתן אישור בחלון של Google. אפשר לנסות שוב ולאשר את ההרשאות המבוקשות.',
      enableUrl: null,
      apiDisabled: false,
      raw: text,
    };
  }

  if (/invalid_grant|expired/i.test(text)) {
    return {
      title: 'קוד האימות פג',
      message: 'קוד האימות של Google פג תוקף. יש להתחבר מחדש כדי לקבל קוד חדש.',
      enableUrl: null,
      apiDisabled: false,
      raw: text,
    };
  }

  if (/insufficient|scope/i.test(text)) {
    return {
      title: 'חסרות הרשאות',
      message: `לא אושרו כל ההרשאות הנדרשות עבור ${label}. יש להתחבר שוב ולאשר את כל הבקשות במסך ההסכמה.`,
      enableUrl: null,
      apiDisabled: false,
      raw: text,
    };
  }

  return {
    title: `החיבור ל-${label} נכשל`,
    message: 'החיבור לא הושלם. ניתן לנסות שוב, ואם התקלה חוזרת יש לבדוק את הגדרות Google של החשבון.',
    enableUrl: null,
    apiDisabled: false,
    raw: text,
  };
}
