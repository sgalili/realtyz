import { publicUrl } from './publicUrl';
import { coldInvitationBody } from '../../supabase/functions/_shared/brokerInvitationTemplate';

/**
 * Cold first-contact invitation an admin copies to a broker.
 * Placeholders use the recipient first name and public view-only demo link.
 * Personal OTP links remain a separate deliberate alternative.
 */
export const BROKER_INVITATION_TEMPLATE = coldInvitationBody(null, ['agent']);

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
  const link = publicUrl('/demo/broker');
  return { link, message: renderBrokerInvitation(BROKER_INVITATION_TEMPLATE, { brokerName: broker.full_name?.trim().split(/\s+/)[0], authLink: link }) };
}

export const personalBrokerLink = (id: string) => publicUrl(`/auth?broker=${encodeURIComponent(id)}`);

export function firstBrokerDestination(value: unknown): '/' | '/properties' {
  return value === '/properties' ? '/properties' : '/';
}
