import { supabase } from '@/integrations/supabase/client';
import { publicUrl } from '@/lib/publicUrl';

export type ContactMode = 'whatsapp' | 'form' | 'phone';

/**
 * Resolve the destination for a group post of a property:
 * - the property page link, tagged with the posting partner's own tracking
 *   code (?ref=) when that user has one for this listing;
 * - the contact mode the property page shows (same rule as the page:
 *   WhatsApp/Rita replaces the form; phone only when form/Rita are off).
 */
export async function resolvePosterDestination(listingId: string, userId: string | null | undefined): Promise<{
  link: string;
  mode: ContactMode;
  ctaLine: string;
}> {
  const { data: row } = await (supabase as any)
    .from('listings')
    .select('id, slug, contact_options')
    .eq('id', listingId)
    .maybeSingle();
  let code: string | null = null;
  if (userId) {
    const { data: refRow } = await (supabase as any)
      .from('affiliate_referrals')
      .select('tracking_code')
      .eq('affiliate_id', userId)
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    code = refRow?.tracking_code ?? null;
  }
  const path = row?.slug ? `/p/${row.slug}` : `/p/${listingId}`;
  const link = publicUrl(code ? `${path}?ref=${code}` : path);
  const opts = (row?.contact_options && typeof row.contact_options === 'object') ? row.contact_options : {};
  const mode: ContactMode = opts.whatsapp ? 'whatsapp' : opts.digital ? 'form' : opts.phone ? 'phone' : 'form';
  const ctaLine =
    mode === 'whatsapp' ? `לשיחה עם ריטה בוואטסאפ: ${link}`
      : mode === 'phone' ? `לשיחה טלפונית, השאירו מספר כאן: ${link}`
        : `להשארת פרטים: ${link}`;
  return { link, mode, ctaLine };
}

/** Swap any generic contact line in the comment for the property's own CTA. */
export function applyContactCta(comment: string | null | undefined, ctaLine: string): string {
  const cleaned = String(comment ?? '')
    .split(/\n+/)
    .filter((l) => !/(wa\.me\/|api\.whatsapp\.com|realtyz\.co\.il\/(r|p)\/)/i.test(l))
    .join('\n')
    .trim();
  return cleaned ? `${cleaned}\n\n${ctaLine}` : ctaLine;
}
