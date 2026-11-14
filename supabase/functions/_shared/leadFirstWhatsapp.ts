export const FIRST_CONTACT_TEMPLATE = 'toraff_contact_opt_in';
export const FIRST_CONTACT_BODY = 'שלום {{1}}, כאן ריטה מ־TORAFF. נשמח ליצור קשר כאן ב־WhatsApp בנוגע לפנייה ולצרכים שלך בתחום הנדל״ן. האם אפשר להמשיך בשיחה? אפשר להשיב כן או לא, ולא נמשיך לשלוח עד לקבלת אישור.';

export function firstContactTemplateReady(template: { name: string; status: string; body_text: string; variable_count: number; has_header_variable: boolean } | null): boolean {
  return !!template && template.name === FIRST_CONTACT_TEMPLATE && template.status === 'APPROVED'
    && template.variable_count === 1 && !template.has_header_variable
    && template.body_text === FIRST_CONTACT_BODY;
}

export function contactFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}