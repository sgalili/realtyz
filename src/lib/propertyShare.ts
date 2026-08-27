// Shared property-sharing helpers. Mints a public share token via the
// `create-property-share` edge function and builds the WhatsApp/SMS message
// that carries the secure landing-page link.
import { supabase } from '@/integrations/supabase/client';
import { formatListingTitle } from '@/lib/formatListingTitle';
import type { UnifiedResult } from '@/lib/propertySearch';
import { publicUrl } from '@/lib/publicUrl';
import { ensureFullPropertyImport } from '@/lib/propertyFullSync';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { openOfficialWhatsApp, sendViaOfficialWaba } from '@/lib/officialWa';


export type ShareMode = 'whatsapp' | 'sms' | 'copy';

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

export function buildPropertyShareMessage(r: UnifiedResult, shareUrl: string): string {
  const priceStr = r.price
    ? `₪${r.price.toLocaleString('he-IL')}${r.listing_type === 'rent' ? '/חודש' : ''}`
    : 'לפרטים';
  const meta = [r.city, r.rooms ? `${r.rooms} חד׳` : null, r.size_sqm ? `${r.size_sqm} מ״ר` : null]
    .filter(Boolean)
    .join(' · ');
  return `שלום 👋
מצאתי עבורך נכס שאני חושב שיעניין אותך:

🏠 ${resultLabel(r)}
📍 ${meta}
💰 ${priceStr}

לצפייה מלאה עם תמונות ופרטים:
${shareUrl}

מוזמנ/ת להגיב כאן ואחזור אליך.`;
}

function buildMultiMessage(items: Array<{ r: UnifiedResult; url: string }>): string {
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
  return `שלום 👋
ריכזתי עבורך ${items.length} נכסים שיכולים להתאים:

${blocks.join('\n\n')}

מוזמנ/ת להגיב כאן ואחזור אליך.`;
}

/** Mints links for one or more properties and opens WhatsApp / SMS, or copies. */
export async function shareProperties(
  results: UnifiedResult[],
  mode: ShareMode,
  recipientPhone: string | null = null,
): Promise<void> {
  if (results.length === 0) throw new Error('לא נבחרו נכסים לשיתוף');
  const phone = normalizeIlPhone(recipientPhone);
  const minted: Array<{ r: UnifiedResult; url: string }> = [];
  for (const r of results) {
    minted.push({ r, url: await mintShareUrlForResult(r, phone) });
  }

  const text =
    minted.length === 1
      ? buildPropertyShareMessage(minted[0].r, minted[0].url)
      : buildMultiMessage(minted);

  if (mode === 'whatsapp') {
    // HARD RULE: outbound WhatsApp must originate from our official Meta WBA
    // number only. With a recipient we dispatch through the official gateway;
    // without one we open a chat with the official number itself.
    if (phone) {
      const res = await sendViaOfficialWaba({ phone_number: phone, message: text });
      if (!res.ok) throw new Error(res.error || 'שליחה בוואטסאפ הרשמי נכשלה');
      return;
    }
    await openOfficialWhatsApp(text);
    return;
  }
  if (mode === 'sms') {
    window.location.href = `sms:${phone ?? ''}?&body=${encodeURIComponent(text)}`;
    return;
  }
  const copyPayload = minted.length === 1 ? minted[0].url : text;
  await navigator.clipboard.writeText(copyPayload);
}
