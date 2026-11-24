/** Plain-language scanner line and Railway worker state for the Super Admin card and broker rows. */
export type ScannerWorkerFields = { enabled: boolean; paused: boolean; worker_seen_at?: string | null; worker_rejected_at?: string | null };

const FRESH_MS = 2 * 60 * 1000;

export type WorkerState = 'connected' | 'rejected' | 'silent';

export function scannerWorkerState(s: ScannerWorkerFields, now = Date.now()): WorkerState {
  const seen = Date.parse(s.worker_seen_at ?? '') || 0;
  const rejected = Date.parse(s.worker_rejected_at ?? '') || 0;
  if (rejected > seen && now - rejected < 10 * 60 * 1000) return 'rejected';
  if (seen && now - seen < FRESH_MS) return 'connected';
  return 'silent';
}

export const workerStateLabels: Record<WorkerState, string> = {
  connected: 'שירות הסריקה מחובר',
  rejected: 'שירות הסריקה נדחה: המפתח ב-Railway אינו תואם',
  silent: 'שירות הסריקה לא דיווח לאחרונה',
};

/** Why a queued discovery is not moving yet, or null when it should be progressing. */
export function scannerBlockReason(s: ScannerWorkerFields, now = Date.now()): string | null {
  if (!s.enabled || s.paused) return 'קו הסריקה מושהה';
  const w = scannerWorkerState(s, now);
  return w === 'connected' ? null : workerStateLabels[w];
}

/** Presentation only: these reasons never recover, promote or change a queue. */
export function scannerDelayReason(s: ScannerWorkerFields & {
  connected?: boolean; webhook_ready?: boolean; pause_reason?: string | null;
  daily_cap: number; used_today: number; next_send_at?: string | null;
  outstanding_until?: string | null;
}, now = Date.now()): string | null {
  if (s.connected === false) return 'קו הוואטסאפ מנותק';
  if (s.webhook_ready === false) return 'קבלת התשובות אינה מוכנה בקו';
  const blocked = scannerBlockReason(s, now);
  if (blocked) return blocked;
  if (s.used_today >= s.daily_cap) return 'המכסה היומית מוצתה. המשך לאחר חצות בישראל';
  if (Date.parse(s.outstanding_until ?? '') > now) return 'ממתין לתשובת יד2 לפנייה קודמת. פנייה אחת בכל פעם';
  if (Date.parse(s.next_send_at ?? '') > now) return 'השהיה בטוחה בין פניות';
  return null;
}

export function scannerFailureReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const reasons: Record<string, string> = {
    reply_timeout_or_unknown_send: 'לא התקבלה תשובה בזמן או שתוצאת השליחה אינה ודאית. נדרשת בדיקה ידנית, ללא שליחה חוזרת אוטומטית',
    reply_timeout: 'לא התקבלה תשובה בתוך שעתיים. נדרשת בדיקה ידנית',
    send_outcome_unknown_no_resend: 'תוצאת השליחה אינה ודאית. אין שליחה חוזרת אוטומטית; נדרשת בדיקה ידנית',
    primary_listing_missing: 'מודעת המקור אינה זמינה. נדרשת בדיקה ידנית',
    missing_message_correlation: 'התקבלה תשובה שלא ניתן לשייך בבטחה למתווך. המספר לא נשמר',
    worker_not_connected_no_progress_180s: 'שירות האיתור לא דיווח על התקדמות במשך שלוש דקות',
    shared_yad2_whatsapp_contact_reset: 'נמצא מספר משותף של יד2, לא מספר וואטסאפ אישי',
    user_cancelled: 'האיתור בוטל ידנית',
    scanner_disconnected: 'קו הוואטסאפ מנותק',
    send_circuit_open: 'הקו הושהה בעקבות שגיאות שליחה',
  };
  if (reasons[reason]) return reasons[reason];
  if (/429|rate.limit|too.many.requests/i.test(reason)) return 'השירות הגביל את קצב הבקשות. ממתין לניסיון בטוח נוסף';
  return null;
}

export type ScannerEtaInput = { daily_cap: number; jitter_min_seconds: number; jitter_max_seconds: number; next_send_at?: string | null; outstanding_until?: string | null; used_today: number; queue_ahead: number };

/** Ms from now until local Israel midnight. */
function msToIsraelMidnight(now: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return (86400 - (g('hour') * 3600 + g('minute') * 60 + g('second'))) * 1000;
}

/** Estimated dispatch time from queue order, remaining daily quota and average pacing. */
export function scannerEta(i: ScannerEtaInput, now = Date.now()): number {
  const avg = ((i.jitter_min_seconds + i.jitter_max_seconds) / 2) * 1000;
  const base = Math.max(now, Date.parse(i.next_send_at ?? '') || 0, Date.parse(i.outstanding_until ?? '') || 0);
  const remaining = Math.max(0, i.daily_cap - i.used_today);
  const n = i.queue_ahead;
  if (n < remaining) return base + n * avg;
  const over = n - remaining;
  const days = Math.floor(over / i.daily_cap);
  return Math.max(base, now + msToIsraelMidnight(now)) + days * 86400000 + (over % i.daily_cap) * avg;
}

/** "2 ימים 03:04:05" style countdown; days only when applicable. */
export function formatCountdown(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d ? `${d} ${d === 1 ? 'יום' : 'ימים'} ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}
