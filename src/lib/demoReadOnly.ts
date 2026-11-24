import { toast } from 'sonner';

export const DEMO_READ_ONLY = 'מרחב הדגמה לקריאה בלבד: שמירה, שליחה ופרסום חסומים.';
// Informational toast methods are globally muted; the explicit denial must remain visible.
export function notifyDemoReadOnly() { toast(DEMO_READ_ONLY, { id: 'demo-read-only' }); }