import { z } from 'zod';

export const RITA_DEFAULT_AGENCY = 'TORAFF';
export const RITA_DEFAULT_VOICE = 't1FxSQNdBrLMfytJMHmg';

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
  demo: z.boolean().optional().default(false),
  record_call: z.boolean().optional().default(true),
}).strict();
export type RitaOutboundInput = z.input<typeof ritaOutboundInputSchema>;

export const ritaPropertySearchSchema = z.object({
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
  agency_name: string;
  agent_name: string;
  broker_id: string;
  lead_name: string;
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
}): RitaDynamicVariables {
  const fullName = String(input.fullName ?? '').trim();
  const agency = String(input.agencyName ?? '').trim() || RITA_DEFAULT_AGENCY;
  return {
    agency_name: agency,
    agent_name: String(input.agentName ?? '').trim() || agency,
    broker_id: input.brokerId ?? '',
    lead_name: firstNameFromFullName(fullName),
    lead_full_name: fullName,
    lead_phone: ritaPhoneE164(input.phone),
    property_id: String(input.property && 'property_id' in input.property ? input.property.property_id : ''),
    property_context: input.property ?? {},
    source: input.source,
    custom_instructions: String(input.instructions ?? '').trim(),
  };
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
