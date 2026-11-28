/** Classifies why an import job is not progressing, so the card never looks like a normal wait. */
export type ImportJobBlock = { kind: 'provider_account' | 'cooldown'; title: string; detail: string; until?: number };
type Cp = { lastError?: { message?: string; status?: number | null } | null; terminalReason?: string; waitReason?: string; waitUntil?: number; transientRetries?: number; rateRetries?: number } | null | undefined;

export function providerAccountError(status: number | null | undefined, message = '') {
  return status === 407 || /client_10020|account.*suspend|billing.*inactive/i.test(message);
}

export function importJobBlock(job: { status: string; error?: string | null } | null | undefined, cp: Cp, now = Date.now()): ImportJobBlock | null {
  if (!job || job.status === 'completed') return null;
  const e = cp?.lastError;
  if (providerAccountError(e?.status, `${e?.message ?? ''} ${job.error ?? ''}`) || cp?.terminalReason === 'authorization_or_provider_configuration')
    return { kind: 'provider_account', title: 'בעיה בחשבון ספק הסריקה (Bright Data)', detail: 'החשבון מושעה או שאימות הפרוקסי נכשל (407). יש להפעיל את החשבון מחדש אצל הספק ואז ללחוץ "ניסיון חוזר". ההתקדמות נשמרה.' };
  const until = Number(cp?.waitUntil ?? 0);
  if (until > now && (cp?.waitReason === 'rate_limit' || cp?.waitReason === 'transient_retry')) {
    const time = new Date(until).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timeout = e?.status === 504 || /timeout/i.test(e?.message ?? '');
    const reason = cp.waitReason === 'rate_limit' ? 'מגבלת בקשות (429)' : timeout ? 'הספק לא הגיב בזמן (504)' : 'תקלה זמנית בחיבור';
    const attempt = cp.waitReason === 'rate_limit' ? cp.rateRetries : cp.transientRetries;
    return { kind: 'cooldown', title: `השהיה זמנית · ${reason}`, detail: `ניסיון חוזר אוטומטי${attempt ? ` ${attempt}` : ''} עד ${time}.`, until };
  }
  return null;
}
