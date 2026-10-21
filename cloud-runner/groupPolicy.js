export const ACTIVE_CAP = 100;
export const RESERVE_CAP = 200;
export function membershipOutcome(text) {
  if (/cancel request|בקשה ממתינה|ביטול בקשה|pending approval/i.test(text)) return 'requested';
  if (/leave group|עזוב את הקבוצה|יציאה מהקבוצה/i.test(text)) return 'joined';
  return null;
}
export function approvedAnswers(requirements, answers, rulesAccepted) {
  if (!rulesAccepted || requirements.some(q => !String(answers?.[q] ?? '').trim())) return null;
  return Object.fromEntries(requirements.map(q => [q, String(answers[q]).trim()]));
}