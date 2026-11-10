import { publicUrl } from './publicUrl';

/**
 * Default manual WhatsApp/SMS invitation an admin copies to a broker.
 * Placeholders: {brokerName} = broker full name, {authLink} = broker-specific
 * OTP login link. Copy is fixed by request — keep it verbatim.
 */
export const BROKER_INVITATION_TEMPLATE = `שלום {brokerName},

לבקשת אודי ויטמן, יועץ נדל״ן מהרצליה, הכנו עבורך מרחב עבודה במערכת TORAFF והזנו את כל הנכסים שלך.

לכניסה לחץ על הקישור וקבל קוד אימות:

{authLink}

לאחר הזנת הקוד ייפתח מסך הנכסים שלך. כל שנותר הוא להגדיר את עמלת הסגירה שאתה מציע לשותפים, לכל נכס בנפרד או לכל הנכסים בבת אחת.

אם נתקלת בבעיה או יש לך שאלות, ניתן לפנות ישירות:

אודי ויטמן: 0522973500

שי גלילי, המפתח והאחראי הטכנולוגי הראשי: 0546811841

בברכה,

צוות TORAFF`;

export function renderBrokerInvitation(
  template: string,
  values: { brokerName?: string | null; authLink: string },
): string {
  const name = String(values.brokerName ?? '').trim();
  return template
    .replace(/\{brokerName\}/g, name)
    .replace(/\{authLink\}/g, values.authLink)
    // No name on file: keep the greeting clean instead of "שלום ,".
    .replace(/^שלום\s+,/, 'שלום,');
}

export function brokerInvitation(broker: { id: string; full_name?: string | null }) {
  const link = publicUrl(`/auth?broker=${encodeURIComponent(broker.id)}`);
  return { link, message: renderBrokerInvitation(BROKER_INVITATION_TEMPLATE, { brokerName: broker.full_name, authLink: link }) };
}

export function firstBrokerDestination(value: unknown): '/' | '/properties' {
  return value === '/properties' ? '/properties' : '/';
}
