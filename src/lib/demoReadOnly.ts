import { toast } from 'sonner';

export const DEMO_READ_ONLY = 'מרחב הדגמה לקריאה בלבד: שמירה, שליחה ופרסום חסומים.';
// Informational toast methods are globally muted; the explicit denial must remain visible.
// Demo actions are blocked silently: no recurring read-only toast inside the demo space.
export function notifyDemoReadOnly() { void toast; }