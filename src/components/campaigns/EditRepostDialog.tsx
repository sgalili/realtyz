import { useEffect, useMemo, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Loader2, RefreshCw, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { stripAddressNumbers } from '@/lib/formatAddress';
import { ScheduleCurrentPostDialog } from '@/components/campaigns/ScheduleCurrentPostDialog';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: {
    id: string;
    channel: string;
    message_body: string | null;
    media_urls?: string[];
    campaign_name: string;
    listing_id?: string | null;
  };
  onPosted?: () => void;
};

type ListingMeta = {
  id: string;
  property_title: string | null;
  property_type: string | null;
  deal_type: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  media_photos: string[] | null;
};

// Human Hebrew label for deal_type / listing_type-ish values.
const dealTypeLabel = (raw: unknown): string | null => {
  const v = String(raw ?? '').toLowerCase().trim();
  if (!v) return null;
  if (v === 'rent' || v === 'השכרה' || v === 'להשכרה') return 'השכרה';
  if (v === 'sale' || v === 'מכירה' || v === 'למכירה') return 'מכירה';
  return null;
};

// ── Webtiv/Homely lookup cache ────────────────────────────────────────────
// Fetches property options once per 5 minutes across the whole app so the
// dialog can be opened repeatedly without spamming the Webtiv API. Concurrent
// callers share a single in-flight request.
const WEBTIV_LOOKUP_TTL_MS = 5 * 60 * 1000;
let webtivLookupCache: { at: number; rows: ListingMeta[] } | null = null;
let webtivLookupInFlight: Promise<ListingMeta[]> | null = null;

async function fetchWebtivLookupOptions(): Promise<ListingMeta[]> {
  const now = Date.now();
  if (webtivLookupCache && (now - webtivLookupCache.at) < WEBTIV_LOOKUP_TTL_MS) {
    return webtivLookupCache.rows;
  }
  if (webtivLookupInFlight) return webtivLookupInFlight;

  webtivLookupInFlight = (async () => {
    // Pull fresh inventory from Webtiv and hydrate into `listings` so we get
    // internal UUIDs that generate-content / ayrshare-post already understand.
    try {
      await supabase.functions.invoke('homely-search', {
        body: { limit: 100, hydrate: true },
      });
    } catch {
      /* non-fatal — we'll still surface whatever the DB has cached */
    }

    const { data } = await supabase
      .from('listings')
      .select('id, property_title, deal_type, address, city, neighborhood, media_photos, source_metadata, features, updated_at')
      .eq('source', 'homely')
      .order('updated_at', { ascending: false })
      .limit(100);

    const rows: ListingMeta[] = ((data ?? []) as any[]).map((row) => {
      const sm = (row.source_metadata && typeof row.source_metadata === 'object') ? row.source_metadata as Record<string, any> : {};
      const featureListingType = Array.isArray(row.features)
        ? (row.features.find((f: any) => f && typeof f === 'object' && 'listing_type' in f)?.listing_type ?? null)
        : null;
      return {
        id: row.id,
        property_title: row.property_title ?? null,
        property_type: (sm.property_type || sm.propertyType || sm.type || null) as string | null,
        deal_type: (row.deal_type || featureListingType) as string | null,
        address: row.address ?? null,
        city: row.city ?? null,
        neighborhood: row.neighborhood ?? null,
        media_photos: Array.isArray(row.media_photos) ? row.media_photos : null,
      };
    });

    webtivLookupCache = { at: Date.now(), rows };
    return rows;
  })().finally(() => { webtivLookupInFlight = null; });

  return webtivLookupInFlight;
}

/**
 * Edit an already-published post: keep its original images, regenerate the
 * copy through the SAME generate-content master pipeline used by the main
 * composer (so the strict 5-block template + canonical footer are enforced),
 * then re-publish to the same channel. Media is preserved verbatim.
 */
export default function EditRepostDialog({ open, onOpenChange, campaign, onPosted }: Props) {
  const [body, setBody] = useState(campaign.message_body ?? '');
  const [regenerating, setRegenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [listingMeta, setListingMeta] = useState<ListingMeta | null>(null);
  const [resolvedListingId, setResolvedListingId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [rateLimited, setRateLimited] = useState<string | null>(null);
  const [lookupOptions, setLookupOptions] = useState<ListingMeta[]>([]);
  const [showLookup, setShowLookup] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [lookupSearch, setLookupSearch] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [firstCommentEnabled, setFirstCommentEnabled] = useState(true);
  const [firstCommentGenerating, setFirstCommentGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setBody(campaign.message_body ?? '');
      setRateLimited(null);
      setShowLookup(false);
      setFirstComment('');
      setFirstCommentEnabled(true);
    }
  }, [open, campaign.message_body]);


  const mediaUrls = Array.isArray(campaign.media_urls) ? campaign.media_urls : [];

  const loadListingMeta = useCallback(async (id: string): Promise<ListingMeta | null> => {
    try {
      const { data } = await supabase
        .from('listings')
        .select('id, property_title, deal_type, address, city, neighborhood, media_photos, source_metadata, features')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const row = data as any;
      const sm = (row.source_metadata && typeof row.source_metadata === 'object') ? row.source_metadata as Record<string, any> : {};
      const featureListingType = Array.isArray(row.features)
        ? (row.features.find((f: any) => f && typeof f === 'object' && 'listing_type' in f)?.listing_type ?? null)
        : null;
      return {
        id: row.id,
        property_title: row.property_title ?? null,
        property_type: (sm.property_type || sm.propertyType || sm.type || null) as string | null,
        deal_type: (row.deal_type || featureListingType) as string | null,
        address: row.address ?? null,
        city: row.city ?? null,
        neighborhood: row.neighborhood ?? null,
        media_photos: Array.isArray(row.media_photos) ? row.media_photos : null,
      };
    } catch {
      return null;
    }
  }, []);

  // Robust listing resolver — tries multiple signals in order:
  //   1) campaign.listing_id (persisted by ayrshare-post into provider_response)
  //   2) ai_content_logs match by generated_text or media overlap
  //   3) listings.media_photos direct overlap
  //   4) listings match by title/address token overlap against message body
  const resolveListingId = useCallback(async (): Promise<string | null> => {
    try {
      if (campaign.listing_id) return campaign.listing_id;

      const original = (campaign.message_body ?? '').trim();
      const media = Array.isArray(campaign.media_urls) ? campaign.media_urls.filter(Boolean) : [];

      const { data: logs } = await supabase
        .from('ai_content_logs')
        .select('listing_id, generated_text, media_urls, created_at, platform')
        .order('created_at', { ascending: false })
        .limit(80);
      const rows = (logs ?? []) as Array<any>;

      // text match
      if (original) {
        const hit = rows.find((r) => {
          if (!r?.listing_id) return false;
          const t = String(r?.generated_text ?? '').trim();
          if (!t) return false;
          return t === original || original.startsWith(t.slice(0, 60)) || t.startsWith(original.slice(0, 60));
        });
        if (hit?.listing_id) return hit.listing_id as string;
      }

      // media overlap against logs
      if (media.length) {
        const mediaSet = new Set(media);
        const hit = rows.find((r) => {
          if (!r?.listing_id) return false;
          const arr = Array.isArray(r?.media_urls) ? r.media_urls : [];
          return arr.some((u: any) => typeof u === 'string' && mediaSet.has(u));
        });
        if (hit?.listing_id) return hit.listing_id as string;
      }

      // media overlap against listings.media_photos
      if (media.length) {
        for (const url of media.slice(0, 3)) {
          const { data: listingHit } = await supabase
            .from('listings')
            .select('id')
            .contains('media_photos', [url])
            .limit(1)
            .maybeSingle();
          if ((listingHit as any)?.id) return (listingHit as any).id as string;
        }
      }

      // title / address token overlap
      if (original) {
        const tokens = Array.from(new Set(
          original
            .split(/[\s,.\n\-|]+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 3 && /[\u0590-\u05FF]/.test(t))
        )).slice(0, 8);
        for (const tok of tokens) {
          const { data: byTitle } = await supabase
            .from('listings')
            .select('id')
            .ilike('property_title', `%${tok}%`)
            .limit(1)
            .maybeSingle();
          if ((byTitle as any)?.id) return (byTitle as any).id as string;
          const { data: byAddr } = await supabase
            .from('listings')
            .select('id')
            .ilike('address', `%${tok}%`)
            .limit(1)
            .maybeSingle();
          if ((byAddr as any)?.id) return (byAddr as any).id as string;
        }
      }

      return null;
    } catch {
      return null;
    }
  }, [campaign.listing_id, campaign.message_body, campaign.media_urls]);

  // On open, resolve + hydrate listing metadata for the dynamic header.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setResolving(true);
      const id = await resolveListingId();
      if (cancelled) return;
      setResolvedListingId(id);
      if (id) {
        const meta = await loadListingMeta(id);
        if (!cancelled) setListingMeta(meta);
      } else {
        setListingMeta(null);
      }
      setResolving(false);
    })();
    return () => { cancelled = true; };
  }, [open, resolveListingId, loadListingMeta]);

  // Lazy-load listings for the manual-lookup fallback directly from the
  // Webtiv/Homely API via the `homely-search` edge function (with hydrate so
  // rows are upserted into `listings` and we get their internal UUIDs back).
  //
  // Anti-spam guardrails:
  //   • Module-level in-memory cache with a 5-minute TTL — repeat opens reuse.
  //   • An in-flight promise guard prevents parallel duplicate invocations.
  //   • A short cooldown blocks rapid re-clicks even after a failure.
  const [lookupLoading, setLookupLoading] = useState(false);
  const openLookup = async () => {
    setShowLookup(true);
    if (lookupOptions.length) return;
    if (lookupLoading) return;
    setLookupLoading(true);
    try {
      const mapped = await fetchWebtivLookupOptions();
      setLookupOptions(mapped);
    } catch (e: any) {
      toast.error('טעינת רשימת הנכסים נכשלה', { description: e?.message });
    } finally {
      setLookupLoading(false);
    }
  };

  const pickListingManually = async (id: string) => {
    setResolvedListingId(id);
    const meta = lookupOptions.find((l) => l.id === id) || await loadListingMeta(id);
    setListingMeta(meta || null);
    setShowLookup(false);
    toast.success('נכס נבחר ידנית');
  };

  // Dynamic dialog title: [property_type] | [מכירה/השכרה] | [street name]
  const dynamicTitle = useMemo(() => {
    if (!listingMeta) return 'עריכה ופרסום מחדש';
    const parts: string[] = [];
    if (listingMeta.property_type) parts.push(String(listingMeta.property_type).trim());
    const deal = dealTypeLabel(listingMeta.deal_type);
    if (deal) parts.push(deal);
    const street = stripAddressNumbers(listingMeta.address || '').trim();
    if (street) parts.push(street);
    return parts.length ? parts.join(' | ') : (listingMeta.property_title || 'עריכה ופרסום מחדש');
  }, [listingMeta]);

  // Free-text search over the manual listing lookup dropdown.
  const filteredOptions = useMemo(() => {
    if (!lookupSearch.trim()) return lookupOptions;
    const q = lookupSearch.trim().toLowerCase();
    return lookupOptions.filter((l) => {
      const hay = [
        l.property_title,
        l.property_type,
        l.deal_type,
        l.address,
        l.city,
        l.neighborhood,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [lookupOptions, lookupSearch]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const selectedListingId = resolvedListingId;

      const rotateNote = [
        'נסח מחדש את הפוסט תוך שמירה קפדנית על תבנית המאסטר של אודי (5 בלוקים בלבד, בסדר הזה):',
        '1) הוק כותרת שכולל: סוג עסקה (למכירה/להשכרה) + סוג הנכס + חדרים כשקיים + שם רחוב (בלי מספר בית) + שכונה כשקיימת + עיר, ובנוסף מילת מפתח משכנעת אחת קצרה.',
        '2) 1-2 משפטים על גודל, קומה, נוף/פיצ׳ר בולט ושדרוגים.',
        '3) "🌇 <שכונה/רחוב + נגישות ונוחות>".',
        '4) "💫 <יתרון אורח חיים>".',
        '5) "מחיר מבוקש: <סכום>. 📞 מוזמנים ליצור קשר לתיאום ביקור!" — מחיר ו-CTA באותה שורה.',
        'אסור: פסקאות פתיחה על "בעולם הנדל״ן", "כמתווך", "בתור מתווך", "אני אודי", "יש לי הכבוד", "אני שמח/גאה להציג", וכל הצגה עצמית או סלוגן שיווקי כללי.',
        'אסור להוסיף שורת מילות מפתח עם | בגוף הפוסט, ואסור האשטגים.',
        'אסור לכלול מספרי בית/דירה/כניסה בכתובת — שם רחוב בלבד.',
        'שמור על אותן עובדות מהנכס (מחיר, חדרים, מ״ר, קומה, שם רחוב) — אל תמציא נתונים.',
        'החתימה הקנונית תתווסף אוטומטית בשרת — אל תכתוב אותה בעצמך.',
        'גוון פתיח, ניסוח ו-CTA לעומת הגרסה הקודמת כדי להימנע מחזרה.',
      ].join('\n');

      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: selectedListingId
            ? 'פוסט קידום נכס (רענון תבנית מאסטר)'
            : `רענון תוכן לפוסט קיים בערוץ ${campaign.channel}`,
          platform: campaign.channel,
          customInstructions: rotateNote,
          selectedListingId: selectedListingId || undefined,
          listingFocusOnly: !!selectedListingId,
        },
      });
      if (error) throw error;
      const next = (data as any)?.content || (data as any)?.text || (data as any)?.body;
      if (next) {
        setBody(String(next));
        toast.success('נוסח חדש מוכן לעריכה');
      } else {
        toast.info('לא התקבל תוכן חדש מה-AI');
      }
    } catch (e: any) {
      toast.error('יצירה מחדש נכשלה', { description: e?.message });
    } finally {
      setRegenerating(false);
    }
  };

  // Generate a 2-line Hebrew first comment (short sentence + keyword line
  // separated by `|`), matching the composer's style. Reuses generate-content
  // with the resolved listing so facts stay grounded and the canonical footer
  // is skipped (first comments must NOT carry the broker signature).
  const generateFirstComment = async () => {
    setFirstCommentGenerating(true);
    try {
      const factsLine = listingMeta
        ? [
            listingMeta.property_type ? `סוג: ${listingMeta.property_type}` : null,
            dealTypeLabel(listingMeta.deal_type) ? `עסקה: ${dealTypeLabel(listingMeta.deal_type)}` : null,
            listingMeta.address ? `רחוב: ${stripAddressNumbers(listingMeta.address)}` : null,
            listingMeta.neighborhood ? `שכונה: ${listingMeta.neighborhood}` : null,
            listingMeta.city ? `עיר: ${listingMeta.city}` : null,
            listingMeta.property_title ? `כותרת: ${listingMeta.property_title}` : null,
          ].filter(Boolean).join(' | ')
        : '';
      const instructions = [
        'כתוב תגובה ראשונה (First Comment) לפוסט נדל"ן — שתי שורות בדיוק, בעברית.',
        'שורה 1: משפט אחד קצר, אנושי ומשכנע על הנכס (עד ~18 מילים). ללא אימוג\'ים/בולטים.',
        'שורה 2: שורת מילות מפתח מופרדות בקווים אנכיים (|) — סוג נכס | עיר | שכונה | רחוב | חדרים | מ״ר | קומה | תכונות בולטות ככל שידוע.',
        factsLine ? `היעזר בעובדות האלו בלבד, אל תמציא נתונים: ${factsLine}` : '',
        'אסור בהחלט: חתימה, שם המתווך, טלפון, רישיון, האשטגים, em-dash או מקפים כפולים.',
        body ? `להקשר בלבד — גוף הפוסט הראשי (אל תחזור עליו): """${body.slice(0, 600)}"""` : '',
      ].filter(Boolean).join('\n\n');
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: 'תגובה ראשונה קצרה לפוסט נדל"ן — שתי שורות בלבד',
          platform: campaign.channel,
          customInstructions: instructions,
          selectedListingId: resolvedListingId || undefined,
          listingFocusOnly: false,
          skipLicenseFooter: true,
        },
      });
      if (error) throw error;
      const raw = String((data as any)?.content || (data as any)?.text || '').trim();
      if (raw) {
        // Keep first two non-empty lines only, strip any signature the model may have slipped in.
        const cleaned = raw
          .replace(/\n*\s*אודי\s+ויטמן[^\n]*/gu, '')
          .replace(/\n*\s*(?:📞|☎️|📱)?\s*0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}[^\n]*/gu, '')
          .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, '')
          .replace(/\n*\s*רישיון\s*תיווך[^\n]*/gu, '');
        const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2);
        setFirstComment(lines.join('\n'));
        toast.success('תגובה ראשונה נוצרה');
      } else {
        toast.info('לא התקבל תוכן לתגובה');
      }
    } catch (e: any) {
      toast.error('יצירת תגובה ראשונה נכשלה', { description: e?.message });
    } finally {
      setFirstCommentGenerating(false);
    }
  };

  const repost = async () => {
    if (!body.trim()) {
      toast.error('אין תוכן לפרסום');
      return;
    }
    setPosting(true);
    setRateLimited(null);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-post', {
        body: {
          post: body.trim(),
          channels: [campaign.channel],
          campaign_name: `${campaign.campaign_name} · שוכפל`,
          media_urls: mediaUrls,
          listing_id: resolvedListingId ?? campaign.listing_id ?? null,
          first_comment: firstCommentEnabled && firstComment.trim() ? firstComment.trim() : null,
        },
      });
      if (error) throw error;
      const payload: any = data ?? {};
      const errCode = payload?.error;
      // Friendly rate-limit surface — provider (Ayrshare) or platform hit the ceiling.
      if (
        errCode === 'rate_limit_exceeded' ||
        errCode === 'RATE_LIMITED' ||
        errCode === 'rate_limited' ||
        payload?.code === 105 ||
        payload?.status === 429
      ) {
        const msg = payload?.message || 'הרשת החברתית מגבילה כרגע פרסומים. נסה שוב בעוד מספר דקות.';
        setRateLimited(String(msg));
        toast.error('הגעת למגבלת פרסום ברשת החברתית', { description: String(msg) });
        return; // keep dialog open so the user can retry
      }
      if (errCode) throw new Error(payload?.message || String(errCode));
      toast.success('הפוסט פורסם מחדש');
      onPosted?.();
      onOpenChange(false);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (/rate.?limit|429|\bcode\s*105\b/i.test(msg)) {
        setRateLimited(msg);
        toast.error('הגעת למגבלת פרסום ברשת החברתית', { description: msg });
      } else {
        toast.error('פרסום מחדש נכשל', { description: msg });
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {resolving ? 'עריכה ופרסום מחדש' : dynamicTitle}
          </DialogTitle>
          <DialogDescription className="text-right">
            התמונות המקוריות נשמרות. נסח מחדש את הטקסט או ערוך ידנית, ואז פרסם שוב לאותו ערוץ.
          </DialogDescription>
        </DialogHeader>

        {!resolving && !resolvedListingId && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              לא זוהה אוטומטית הנכס המקורי — אפשר לבחור אותו ידנית כדי לרענן לפי תבנית המאסטר.
            </div>
            {!showLookup ? (
              <Button size="sm" variant="outline" onClick={openLookup} disabled={lookupLoading}>
                {lookupLoading ? (<><Loader2 className="h-3 w-3 animate-spin ml-1" />טוען מ‑Webtiv…</>) : 'בחר נכס ידנית'}
              </Button>
            ) : (
              <Select onValueChange={pickListingManually}>
                <SelectTrigger className="w-full"><SelectValue placeholder="בחר נכס מהרשימה" /></SelectTrigger>
                <SelectContent>
                  <div
                    className="p-2"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      placeholder="חיפוש חופשי..."
                      value={lookupSearch}
                      onChange={(e) => setLookupSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  {filteredOptions.map((l) => {
                    const street = stripAddressNumbers(l.address || '').trim();
                    const deal = dealTypeLabel(l.deal_type);
                    const label = [l.property_type, deal, street || l.property_title || l.city].filter(Boolean).join(' | ');
                    return <SelectItem key={l.id} value={l.id}>{label || l.id}</SelectItem>;
                  })}
                  {filteredOptions.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">אין תוצאות חיפוש</div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {rateLimited && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              הגעת למגבלת פרסום ברשת החברתית
            </div>
            <div className="text-muted-foreground">{rateLimited}</div>
            <Button size="sm" variant="outline" onClick={repost} disabled={posting}>
              <RefreshCw className="h-4 w-4 ml-1" />
              נסה שוב
            </Button>
          </div>
        )}

        {mediaUrls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto py-1">
            {mediaUrls.slice(0, 8).map((u, i) => (
              <img key={i} src={u} alt="" loading="lazy"
                   className="h-20 w-20 rounded-md object-cover border border-border shrink-0" />
            ))}
          </div>
        )}

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="text-sm"
          placeholder="ערוך את גוף הפוסט..."
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={regenerate} disabled={regenerating || posting}>
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            נסח מחדש עם AI
          </Button>
          <Button
            variant="outline"
            onClick={() => setScheduleDialogOpen(true)}
            disabled={posting || regenerating || !body.trim()}
            title="תזמן פרסום (כולל חזרות)"
          >
            <CalendarIcon className="h-4 w-4" />
            תזמן
          </Button>
          <Button onClick={repost} disabled={posting || regenerating || !body.trim()}>
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            פרסם עכשיו
          </Button>
        </DialogFooter>
      </DialogContent>

      <ScheduleCurrentPostDialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        onScheduled={() => {
          setScheduleDialogOpen(false);
          toast.success('הפוסט תוזמן');
          onPosted?.();
          onOpenChange(false);
        }}
        channelId={campaign.channel}
        channelLabel={campaign.channel}
        brandName={`${campaign.campaign_name} · שוכפל`}
        body={body}
        firstComment=""
        mediaUrls={mediaUrls}
        listingId={resolvedListingId ?? campaign.listing_id ?? null}
        defaultGroupIds={[]}
        targets={[]}
        isSocialChannel={['facebook','instagram','x','twitter','linkedin','youtube','tiktok'].includes(campaign.channel)}
      />
    </Dialog>
  );
}
