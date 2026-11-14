import { FOCUS_COLUMNS, type FocusRow } from './focusProperty.ts';

export function propertyIdsFromText(text: string): string[] {
  const matches = String(text ?? '').matchAll(/(?<![a-z0-9])[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![a-z0-9])/gi);
  return [...new Set([...matches].map(match => match[0].toLowerCase()))].slice(0, 5);
}

export type WaPropertyContext = { listing_id: string; owner_id: string; deal_type: string | null; city: string | null; neighborhood: string | null; row: FocusRow };

/** A UUID is a public-property hint, never authority to read another person's lead. */
export async function resolveWaPropertyContext(admin: { from: (table: string) => any }, text: string): Promise<WaPropertyContext | null> {
  const ids = propertyIdsFromText(text);
  if (!ids.length) return null;
  const { data, error } = await admin.from('listings')
    .select(`${FOCUS_COLUMNS},workspace_owner_id,is_published,affiliate_enabled,distribution_paused,status`)
    .in('id', ids);
  if (error) throw new Error('property_context_lookup_failed');
  const eligible = (data ?? []).filter((row: any) => row.workspace_owner_id && (row.is_published === true || row.affiliate_enabled === true) && row.distribution_paused !== true && row.status === 'live');
  // Ambiguous messages must not pick a property based on database row order.
  if (eligible.length !== 1) return null;
  const row = eligible[0];
  return { listing_id: row.id, owner_id: row.workspace_owner_id, deal_type: row.deal_type ?? null, city: row.city ?? null, neighborhood: row.neighborhood ?? null, row };
}

export const EXPLICIT_PROPERTY_PROMPT = '\n[EXPLICIT_PROPERTY_UUID] The current message names this exact public property. Answer only about this property and its deal, using verified property facts. Never replace it with previous properties, generic buyer qualification, or rooms-versus-budget questions. The sender is a separate participant; never disclose another lead, private CRM data, contracts or commission details.\n';

export function retainPropertyReply(reply: string, context: WaPropertyContext): string {
  if (reply.trim() && !/מה הכי חשוב כרגע|כמה חדרים אתם מחפשים ומה התקציב|מספר החדרים או התקציב/.test(reply)) return reply;
  const title = String(context.row.property_title || [context.row.address, context.row.city].filter(Boolean).join(', ') || 'הנכס שצוין בהודעה');
  return `הפנייה מתייחסת ל${title}. אילו פרטים נוספים על הנכס תרצו לקבל?`;
}