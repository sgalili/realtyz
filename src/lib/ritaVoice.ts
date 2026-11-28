import { z } from 'zod';

export const RITA_DEFAULT_AGENCY = 'TORAFF';
export const RITA_DEFAULT_VOICE = 't1FxSQNdBrLMfytJMHmg';
export const RITA_PHONE_NUMBER = '+97233826735';
export const RITA_FALLBACK_GREETING = 'שלום, אני ריטה מטוֹרָאף, העוזרת הדיגיטלית לשירותי הפלטפורמה. איך אפשר לעזור במסגרת טוֹרָאף?';
export const ritaCallRoleSchema = z.enum(['property_lead', 'broker_invite', 'broker_support', 'general_inbound']);
export type RitaCallRole = z.infer<typeof ritaCallRoleSchema>;

const optionalUuid = z.union([z.string().uuid(), z.literal('')]).optional();
export const ritaOutboundInputSchema = z.object({
  phone_number: z.string().trim().max(30).optional(),
  full_name: z.string().trim().min(2).max(80).optional(),
  lead_id: optionalUuid,
  property_id: optionalUuid,
  workspace_owner_id: optionalUuid,
  source: z.string().trim().min(1).max(80).default('lead_card'),
  instructions: z.string().trim().max(1500).optional(),
  voice_id: z.string().trim().max(100).optional(),
  call_role: ritaCallRoleSchema.optional(),
  hat: ritaCallRoleSchema.optional(),
  invite_context: z.string().trim().max(1500).optional(),
  demo: z.boolean().optional().default(false),
  record_call: z.boolean().optional().default(true),
  /** Super Admin test calls only: scenario to simulate against a typed target number. */
  test_scenario: z.enum(['property_lead', 'seller_lead', 'broker_invite', 'broker_onboarded', 'broker_support', 'general_inbound']).optional(),
  /** Super Admin test calls only: grammatical gender for Rita's Hebrew. */
  gender: z.enum(['male', 'female']).optional(),
}).strict();
export type RitaGender = 'male' | 'female';
export const RITA_TEST_INITIAL_SECONDS = 60;
export const RITA_TEST_EXTENSION_SECONDS = 120;
export const RITA_TEST_MAX_SECONDS = RITA_TEST_INITIAL_SECONDS + RITA_TEST_EXTENSION_SECONDS;

/** Unknown or unrecognized gender defaults to male Hebrew. */
export function normalizeRitaGender(value: unknown): RitaGender {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'female' || v === 'f' || v === 'אישה' || v === 'נקבה' || v === 'woman' ? 'female' : 'male';
}
export type RitaOutboundInput = z.input<typeof ritaOutboundInputSchema>;

export const ritaPropertySearchSchema = z.object({
  rita_call_context_id: optionalUuid,
  broker_id: optionalUuid,
  property_id: optionalUuid,
  city_or_area: z.string().trim().max(120).optional(),
  min_rooms: z.coerce.number().min(0).max(20).optional(),
  max_price: z.coerce.number().min(0).max(1_000_000_000).optional(),
  property_type: z.string().trim().max(80).optional(),
}).strict();
export type RitaPropertySearchInput = z.input<typeof ritaPropertySearchSchema>;

export type RitaPropertyContext = {
  property_id: string;
  title: string;
  city: string;
  neighborhood: string;
  rooms: number | null;
  price: number | null;
  deal_type: string;
};

export type RitaDynamicVariables = {
  call_role: RitaCallRole;
  hat: RitaCallRole;
  invite_context: string;
  agency_name: string;
  agent_name: string;
  broker_id: string;
  lead_name: string;
  first_name: string;
  gender: RitaGender;
  is_test_call: boolean;
  broker_stage: string;
  lead_full_name: string;
  lead_phone: string;
  property_id: string;
  property_context: RitaPropertyContext | Record<string, never>;
  rita_call_context_id?: string;
  source: string;
  custom_instructions: string;
};

export function firstNameFromFullName(fullName: string | null | undefined): string {
  return String(fullName ?? '').trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

export function normalizeRitaPhone(raw: string | null | undefined): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (!digits.startsWith('0')) digits = `0${digits}`;
  const valid = /^05\d{8}$/.test(digits) || /^07\d{8}$/.test(digits) || /^0[2-489]\d{7}$/.test(digits) || /^0[2-489]\d{6}$/.test(digits);
  return valid ? `972${digits.slice(1)}` : null;
}

export function ritaPhoneE164(raw: string | null | undefined): string {
  const normalized = normalizeRitaPhone(raw);
  return normalized ? `+${normalized}` : '';
}

export function propertyContextFromListing(listing: Record<string, unknown> | null | undefined): RitaPropertyContext | Record<string, never> {
  if (!listing) return {};
  const numberOrNull = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    property_id: String(listing['id'] ?? ''),
    title: String(listing['property_title'] ?? listing['address'] ?? '').trim(),
    city: String(listing['city'] ?? '').trim(),
    neighborhood: String(listing['neighborhood'] ?? '').trim(),
    rooms: numberOrNull(listing['rooms']),
    price: numberOrNull(listing['asking_price']),
    deal_type: String(listing['deal_type'] ?? '').trim(),
  };
}

export function buildRitaDynamicVariables(input: {
  agencyName?: string | null;
  agentName?: string | null;
  brokerId?: string | null;
  fullName?: string | null;
  phone?: string | null;
  property?: RitaPropertyContext | Record<string, never>;
  source: string;
  instructions?: string | null;
  callRole?: RitaCallRole;
  inviteContext?: string | null;
  gender?: unknown;
  isTestCall?: boolean;
  brokerStage?: string | null;
}): RitaDynamicVariables {
  const fullName = String(input.fullName ?? '').trim();
  const agency = String(input.agencyName ?? '').trim() || RITA_DEFAULT_AGENCY;
  return {
    call_role: input.callRole ?? 'general_inbound',
    hat: input.callRole ?? 'general_inbound',
    invite_context: String(input.inviteContext ?? '').trim(),
    agency_name: agency,
    agent_name: String(input.agentName ?? '').trim() || agency,
    broker_id: input.brokerId ?? '',
    lead_name: firstNameFromFullName(fullName),
    first_name: firstNameFromFullName(fullName),
    gender: normalizeRitaGender(input.gender),
    is_test_call: input.isTestCall === true,
    broker_stage: String(input.brokerStage ?? '').trim() || (input.callRole === 'broker_support' ? 'active' : input.callRole === 'broker_invite' ? 'invited' : ''),
    lead_full_name: fullName,
    lead_phone: ritaPhoneE164(input.phone),
    property_id: String(input.property && 'property_id' in input.property ? input.property.property_id : ''),
    property_context: input.property ?? {},
    source: input.source,
    custom_instructions: String(input.instructions ?? '').trim(),
  };
}

/** Lifecycle refines the opening only; it never changes the authorized call hat. */
export function ritaOpeningFrame(variables: RitaDynamicVariables): RitaCallRole | 'broker_onboarded' | 'seller_lead' {
  if (['broker_support', 'broker_invite'].includes(variables.call_role) && ['onboarded', 'onboarded_welcome'].includes(variables.broker_stage)) return 'broker_onboarded';
  if (variables.call_role === 'property_lead' && variables.is_test_call && variables.custom_instructions.includes('מעוניין למכור נכס')) return 'seller_lead';
  return variables.call_role;
}

export function ritaOpeningGreeting(variables: RitaDynamicVariables): string {
  const hello = variables.lead_name ? `שלום ${variables.lead_name},` : 'שלום,';
  const yours = variables.gender === 'female' ? 'שֶׁלָּךְ' : 'שֶׁלְּךָ';
  const forYou = variables.gender === 'female' ? 'עֲבוּרֵךְ' : 'עֲבוּרְךָ';
  const agency = variables.agency_name.replace(/\bTORAFF?\b/gi, 'טוֹרָאף');
  const office = agency === 'טוֹרָאף' ? `המשרד ${yours}` : `משרד ${agency}`;
  const frame = ritaOpeningFrame(variables);
  if (frame === 'broker_invite') return `${hello} אני ריטה מטוֹרָאף, ואני מתקשרת לשיחה קצרה על הזמנת ${office} להצטרף לפלטפורמה ועל הערך של השותפות. אפשר לדבר בקצרה?`;
  if (frame === 'broker_onboarded') return `${hello} אני ריטה מטוֹרָאף, העוזרת הדיגיטלית ${yours}, ואני מתקשרת להיכרות ממוקדת של כדקה בעקבות הצטרפות ${office} לפלטפורמה. ${variables.gender === 'female' ? 'ברוכה הבאה' : 'ברוך הבא'} לטוֹרָאף! אני זמינה ${forYou} גם בתפריט הצדדי באפליקציה. אפשר להתחיל?`;
  if (frame === 'broker_support') return `${hello} אני ריטה מטוֹרָאף, העוזרת הדיגיטלית של ${office}, ואני כאן לעזור עם הנכסים בשיווק, הלידים או מרחב העבודה ${yours}. במה נתמקד היום?`;
  const property = 'title' in variables.property_context ? variables.property_context.title : '';
  if (frame === 'seller_lead') return `${hello} אני ריטה מטוֹרָאף, הסוכנת הדיגיטלית${agency === 'טוֹרָאף' ? '' : ` של ${agency}`}, ואני כאן לגבי הפנייה ${yours} למכירת נכס${property ? `, ${property}` : ''}. מה חשוב לְךָ לקדם במכירה?`.replace('לְךָ', variables.gender === 'female' ? 'לָךְ' : 'לְךָ');
  if (frame === 'property_lead') return `${hello} אני ריטה מטוֹרָאף, הסוכנת הדיגיטלית${agency === 'טוֹרָאף' ? '' : ` של ${agency}`}, ואני חוזרת לגבי הפנייה ${yours}${property ? ` על ${property}` : ' לחיפוש הנכס הבא'}. תודה שבחרת לחפש את הנכס הבא דרך הפלטפורמה. מה חשוב ${variables.gender === 'female' ? 'לָךְ' : 'לְךָ'} לברר לגבי הפנייה?`;
  return `${hello} אני ריטה מטוֹרָאף, העוזרת הדיגיטלית לשירותי הפלטפורמה. איך אפשר לעזור במסגרת טוֹרָאף?`;
}

/** ElevenLabs accepts scalar dynamic variables; structured property facts travel as JSON. */
export function ritaProviderVariables(variables: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = { gender: normalizeRitaGender(variables['gender']) };
  for (const [key, value] of Object.entries(variables)) {
    if (key === 'gender') continue;
    if (value === null || value === undefined) continue;
    result[key] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : JSON.stringify(value);
  }
  return result;
}

export function isPlaceholderLeadName(name: string | null | undefined): boolean {
  const value = String(name ?? '').trim();
  return !value || /^(פנייה טלפונית|לקוח|ליד|מתעניין|ללא שם|caller\b|unknown\b)/i.test(value);
}

export function concisePublicText(value: unknown, max = 320): string {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/(?:\+?972|0)\s*\d(?:[\s-]?\d){7,9}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizeRitaConfigurationOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('כתובת היישום אינה מאושרת לתצורת ריטה');
  }
  const hostname = url.hostname.toLowerCase();
  const allowedHost = hostname === 'toraff.co.il'
    || hostname === 'www.toraff.co.il'
    || hostname.endsWith('.lovable.app')
    || hostname.endsWith('.lovableproject.com');
  const cleanUrl = url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.port
    && url.pathname === '/'
    && !url.search
    && !url.hash;
  if (!allowedHost || !cleanUrl) throw new Error('כתובת היישום אינה מאושרת לתצורת ריטה');
  return url.origin;
}
