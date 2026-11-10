export const BROKER_EMAIL_BATCH_MAX = 25;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function brokerFirstName(full?: string | null): string {
  return String(full ?? '').trim().split(/\s+/)[0] ?? '';
}

export function propertyExample(l: { property_title?: string | null; address?: string | null; city?: string | null; deal_type?: string | null }): string | null {
  const street = String(l.address ?? '').replace(/\d+.*$/, '').trim();
  const city = String(l.city ?? '').trim();
  if (!street && !city) return null;
  const deal = l.deal_type === 'rent' ? 'להשכרה' : 'למכירה';
  const place = [street ? `ברחוב ${street}` : '', city].filter(Boolean).join(', ');
  return `הנכס ${deal} ${place}`;
}

export function brokerInvitationEmailHtml(o: { firstName: string; examples: string[]; link: string; unsubscribeUrl: string }): string {
  const ex = o.examples.length ? `<p style="margin:0 0 16px">בין השאר: ${o.examples.map(e => `<strong>${esc(e)}</strong>`).join(' ו')}.</p>` : '';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:28px 22px;text-align:right;line-height:1.7;font-size:16px">
<div style="font-weight:700;font-size:20px;color:#0f2a4a;margin-bottom:18px">TORAFF</div>
<p style="margin:0 0 14px">שלום${o.firstName ? ` ${esc(o.firstName)}` : ''},</p>
<p style="margin:0 0 14px">חסכנו לך את העבודה והזנו עבורך את פרטי הנכסים. הם שמורים במרחב האישי שלך ב-TORAFF וממתינים לבדיקה שלך.</p>
${ex}
<p style="margin:0 0 22px">הנכסים לא יתפרסמו בלי אישורך. אחרי כניסה עם קוד אימות אפשר לעבור עליהם, לתקן פרטים ולקבוע עמלת סגירה ותמחור פניות.</p>
<p style="margin:0 0 26px"><a href="${esc(o.link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">כניסה לנכסים שלי</a></p>
<p style="margin:0;color:#6b7280;font-size:13px">בברכה, צוות TORAFF</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px">
<p style="margin:0;color:#9ca3af;font-size:12px">קיבלת הודעה זו כי הסכמת לקבל מאיתנו מידע. <a href="${esc(o.unsubscribeUrl)}" style="color:#6b7280">להסרה מרשימת התפוצה</a></p>
</div></body></html>`;
}
