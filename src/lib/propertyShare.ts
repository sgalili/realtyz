// Shared property-sharing helpers. Mints a public share token via the
// `create-property-share` edge function and builds the WhatsApp/SMS message
// that carries the secure landing-page link.
import { supabase } from '@/integrations/supabase/client';
import { formatListingTitle } from '@/lib/formatListingTitle';
import type { UnifiedResult } from '@/lib/propertySearch';
import { publicUrl } from '@/lib/publicUrl';
import { ensureFullPropertyImport } from '@/lib/propertyFullSync';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { openWhatsAppContactPicker, sendViaOfficialWaba } from '@/lib/officialWa';


export type ShareMode = 'whatsapp' | 'sms' | 'email' | 'copy';

export type ShareRecipient = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export function normalizeIlPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

export function resultLabel(r: UnifiedResult): string {
  return (
    formatListingTitle({
      address: r.address,
      city: r.city,
      property_type: r.property_type,
      title: r.title,
    }) || r.title
  );
}

/** Never let a slow scrape hang the share button. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function mintShareUrlForResult(
  r: UnifiedResult,
  leadPhone: string | null = null,
): Promise<string> {
  const payload: Record<string, unknown> = { lead_phone: leadPhone };
  if (r.localId) {
    // Best-effort enrichment: bounded so the share link is always minted fast.
    await withTimeout(ensureFullPropertyImport(r.localId, r.url ?? null), 6000);
    payload.listing_id = r.localId;
  } else {
    // External row — import it first so the visitor gets the full gallery
    // and description instead of a thin snapshot.
    try {
      const id = await withTimeout(autoImportResult(r), 8000);
      if (id) {
        void withTimeout(ensureFullPropertyImport(id, r.url ?? null), 6000);
        payload.listing_id = id;
      }
    } catch (e) {
      console.warn('[propertyShare] pre-import failed, falling back to snapshot', e);
    }
  }

  if (!payload.listing_id) {

    payload.external_snapshot = {
      property_title: resultLabel(r),
      asking_price: r.price,
      city: r.city,
      address: r.address,
      neighborhood: r.neighborhood ?? null,
      rooms: r.rooms,
      sqm: r.size_sqm,
      floor: r.floor ?? null,
      deal_type: r.listing_type,
      description: r.description ?? null,
      media_photos: (r.photos ?? []).filter(Boolean),
      source_url: r.url,
    };
  }
  const { data, error } = await supabase.functions.invoke('create-property-share', { body: payload });
  if (error) throw error;
  const token = (data as any)?.token;
  if (!token) throw new Error('לא התקבל טוקן שיתוף');
  return publicUrl(`/share/property/${token}`);
}

/** Greeting line — personalized with the recipient name when one was given. */
function greeting(recipientName?: string | null): string {
  const name = String(recipientName ?? '').trim();
  return name ? `שלום ${name} 👋` : 'שלום 👋';
}

export function buildPropertyShareMessage(
  r: UnifiedResult,
  shareUrl: string,
  recipientName?: string | null,
): string {
  const priceStr = r.price
    ? `₪${r.price.toLocaleString('he-IL')}${r.listing_type === 'rent' ? '/חודש' : ''}`
    : 'לפרטים';
  const meta = [r.city, r.rooms ? `${r.rooms} חד׳` : null, r.size_sqm ? `${r.size_sqm} מ״ר` : null]
    .filter(Boolean)
    .join(' · ');
  return `${greeting(recipientName)}
מצאתי עבורך נכס שאני חושב שיעניין אותך:

🏠 ${resultLabel(r)}
📍 ${meta}
💰 ${priceStr}

לצפייה מלאה עם תמונות ופרטים:
${shareUrl}

מוזמנ/ת להגיב כאן ואחזור אליך.`;
}

function buildMultiMessage(
  items: Array<{ r: UnifiedResult; url: string }>,
  recipientName?: string | null,
): string {
  const blocks = items.map(({ r, url }, i) => {
    const priceStr = r.price
      ? `₪${r.price.toLocaleString('he-IL')}${r.listing_type === 'rent' ? '/חודש' : ''}`
      : 'לפרטים';
    const meta = [r.city, r.rooms ? `${r.rooms} חד׳` : null, r.size_sqm ? `${r.size_sqm} מ״ר` : null]
      .filter(Boolean)
      .join(' · ');
    return `${i + 1}. 🏠 ${resultLabel(r)}
📍 ${meta}
💰 ${priceStr}
🔗 ${url}`;
  });
  return `${greeting(recipientName)}
ריכזתי עבורך ${items.length} נכסים שיכולים להתאים:

${blocks.join('\n\n')}

מוזמנ/ת להגיב כאן ואחזור אליך.`;
}

/** Mints links for one or more properties and opens WhatsApp / SMS, or copies. */
export async function shareProperties(
  results: UnifiedResult[],
  mode: ShareMode,
  recipient: ShareRecipient | null = null,
): Promise<void> {
  if (results.length === 0) throw new Error('לא נבחרו נכסים לשיתוף');
  const phone = normalizeIlPhone(recipient?.phone);
  const email = String(recipient?.email ?? '').trim().toLowerCase();
  const minted: Array<{ r: UnifiedResult; url: string }> = [];
  for (const r of results) {
    minted.push({ r, url: await mintShareUrlForResult(r, phone) });
  }

  const recipientName = String(recipient?.name ?? '').trim() || null;
  const text =
    minted.length === 1
      ? buildPropertyShareMessage(minted[0].r, minted[0].url, recipientName)
      : buildMultiMessage(minted, recipientName);

  if (mode === 'whatsapp') {
    // With an explicit recipient we dispatch through our official Meta WBA
    // gateway (HARD RULE: outbound sender identity is always the official
    // number). Without a recipient we open the NATIVE WhatsApp app on its
    // contact-picker with the text pre-filled, so the broker picks the contact.
    if (phone) {
      const res = await sendViaOfficialWaba({ phone_number: phone, message: text });
      if (!res.ok) throw new Error(res.error || 'שליחה בוואטסאפ הרשמי נכשלה');
      await recordAffiliateDeliveries(minted, mode, text, recipient, res);
      return;
    }
    openWhatsAppContactPicker(text);
    return;
  }

  if (mode === 'sms') {
    if (!phone) throw new Error('יש להזין מספר טלפון');
    const { data, error } = await supabase.functions.invoke('dispatch-campaign', {
      body: { mode: 'test', channel: 'sms', recipient: phone, message: text },
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      throw new Error((data as { failure_reason?: string } | null)?.failure_reason || 'שליחת SMS נכשלה');
    }
    await recordAffiliateDeliveries(minted, mode, text, recipient, data);
    return;
  }
  if (mode === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('יש להזין כתובת אימייל תקינה');
    const { data, error } = await supabase.functions.invoke('dispatch-campaign', {
      body: { mode: 'test', channel: 'email', recipient: email, subject: `נכס שעשוי להתאים לך · Realtyz`, message: text },
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      throw new Error((data as { failure_reason?: string } | null)?.failure_reason || 'שליחת האימייל נכשלה');
    }
    await recordAffiliateDeliveries(minted, mode, text, recipient, data);
    return;
  }
  const copyPayload = minted.length === 1 ? minted[0].url : text;
  await navigator.clipboard.writeText(copyPayload);
}

async function recordAffiliateDeliveries(
  minted: Array<{ r: UnifiedResult; url: string }>,
  channel: Exclude<ShareMode, 'copy'>,
  message: string,
  recipient: ShareRecipient | null,
  deliveryResult: unknown,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const affiliateId = auth.user?.id;
  if (!affiliateId) return;

  for (const item of minted) {
    const raw = (item.r.raw ?? {}) as Record<string, unknown>;
    const listingId = item.r.localId;
    const brokerId = typeof raw.broker_id === 'string' ? raw.broker_id : null;
    if (!listingId || !brokerId) continue;

    const referralChannel = channel === 'email' ? 'email' : channel;
    let { data: referral } = await supabase
      .from('affiliate_referrals')
      .select('id')
      .eq('affiliate_id', affiliateId)
      .eq('listing_id', listingId)
      .eq('channel', referralChannel)
      .maybeSingle();

    if (!referral) {
      const tiers = {
        tier1: Number(raw.tier1_amount ?? 0),
        tier2: Number(raw.tier2_amount ?? 0),
        tier3: Number(raw.tier3_amount ?? 0),
        tier3Type: raw.tier3_type === 'percent' ? 'percent' : 'fixed',
      } as const;
      const { data: created } = await supabase.from('affiliate_referrals').insert({
        affiliate_id: affiliateId,
        broker_id: brokerId,
        listing_id: listingId,
        tracking_code: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        channel: referralChannel,
        status: 'promoting',
        reward_type: raw.reward_type === 'percent' ? 'percent' : 'fixed',
        reward_amount: Number(raw.reward_amount ?? 0),
        tier1_amount: tiers.tier1,
        tier2_amount: tiers.tier2,
        tier3_type: tiers.tier3Type,
        tier3_amount: tiers.tier3,
      }).select('id').single();
      referral = created;
    }
    if (!referral?.id) continue;

    await supabase.from('affiliate_share_deliveries').insert({
      affiliate_id: affiliateId,
      broker_id: brokerId,
      listing_id: listingId,
      referral_id: referral.id,
      channel,
      recipient_name: recipient?.name?.trim() || null,
      recipient_phone: phoneForStorage(recipient?.phone),
      recipient_email: recipient?.email?.trim().toLowerCase() || null,
      message,
      short_url: item.url,
      delivery_status: 'sent',
      delivery_result: JSON.parse(JSON.stringify(deliveryResult ?? {})),
    });
  }
}

function phoneForStorage(value: string | null | undefined): string | null {
  return normalizeIlPhone(value);
}
