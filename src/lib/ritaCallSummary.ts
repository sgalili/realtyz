import { z } from 'zod';
import { ritaCallRoleSchema } from './ritaVoice';

export const ritaCallSummarySchema = z.object({
  conversation_id: z.string().min(1).max(160),
  call_record_id: z.string().uuid().nullable().optional(),
  started_at: z.string().datetime({ offset: true }),
  direction: z.enum(['inbound', 'outbound']),
  duration_seconds: z.number().int().min(0).max(86400),
  call_role: ritaCallRoleSchema,
  bullets: z.array(z.string().max(240)).max(3),
  qualification: z.object({
    budget_financing: z.string().max(240).nullable(),
    timeline_urgency: z.string().max(240).nullable(),
    area_flexibility: z.string().max(240).nullable(),
    viewing_availability: z.string().max(240).nullable(),
    next_step: z.string().max(240).nullable(),
    requested_callback: z.boolean(),
  }),
  matched_property_ids: z.array(z.string().uuid()).max(20),
});
export type RitaCallSummaryData = z.infer<typeof ritaCallSummarySchema>;

export function parseRitaCallSummary(value: unknown): RitaCallSummaryData | null {
  const parsed = ritaCallSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function conciseRitaText(value: unknown, limit = 240): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\r/g, '').replace(/[-–—]{2,}|[–—]/g, ',').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.length > limit ? `${cleaned.slice(0, limit - 1).trimEnd()}…` : cleaned : null;
}

/** Keep only facts supplied by post-call analysis; never synthesize qualification. */
export function ritaSummaryBullets(value: unknown, fallback: unknown): string[] {
  const supplied = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\n+/) : [];
  const candidates = supplied.length ? supplied : typeof fallback === 'string' ? fallback.split(/\n+|(?<=[.!?])\s+/) : [];
  const cleaned = candidates.map(line => conciseRitaText(typeof line === 'string' ? line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '') : line)).filter((line): line is string => !!line);
  return Array.from(new Set(cleaned)).slice(0, 3);
}

export const RITA_CALL_ROLE_LABELS = {
  property_lead: 'פנייה על נכס', broker_invite: 'הזמנת מתווך', broker_support: 'סיוע למתווך', general_inbound: 'שיחה כללית',
} as const;

export function ritaCallDuration(seconds: number): string {
  const duration = Math.max(0, Math.round(seconds));
  return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
}