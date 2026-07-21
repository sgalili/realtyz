import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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

  useEffect(() => {
    if (open) setBody(campaign.message_body ?? '');
  }, [open, campaign.message_body]);

  const mediaUrls = Array.isArray(campaign.media_urls) ? campaign.media_urls : [];

  // Best-effort lookup of the originating listing so generate-content can
  // rebuild the post from the real property record (same behavior as the main
  // composer). We match the most recent ai_content_logs row for this platform
  // whose body matches the campaign's message_body.
  // Resolve the originating listing so generate-content can rebuild the post
  // from the real property record (identical behavior to the main composer).
  // We try multiple signals in order:
  //   1) exact/near-exact text match against ai_content_logs (last 50)
  //   2) media_urls overlap with ai_content_logs (photos are preserved on repost)
  //   3) media_urls overlap with listings.media_photos (direct match to a listing)
  const resolveListingId = async (): Promise<string | null> => {
    try {
      const original = (campaign.message_body ?? '').trim();
      const media = Array.isArray(campaign.media_urls) ? campaign.media_urls.filter(Boolean) : [];

      // Pull a recent slice of logs to match against.
      const { data: logs } = await supabase
        .from('ai_content_logs')
        .select('listing_id, generated_text, media_urls, created_at, platform')
        .order('created_at', { ascending: false })
        .limit(50);
      const rows = (logs ?? []) as Array<any>;

      // (1) text match
      if (original) {
        const hit = rows.find((r) => {
          if (!r?.listing_id) return false;
          const t = String(r?.generated_text ?? '').trim();
          if (!t) return false;
          return t === original || original.startsWith(t.slice(0, 80)) || t.startsWith(original.slice(0, 80));
        });
        if (hit?.listing_id) return hit.listing_id as string;
      }

      // (2) media overlap against logs
      if (media.length) {
        const mediaSet = new Set(media);
        const hit = rows.find((r) => {
          if (!r?.listing_id) return false;
          const arr = Array.isArray(r?.media_urls) ? r.media_urls : [];
          return arr.some((u: any) => typeof u === 'string' && mediaSet.has(u));
        });
        if (hit?.listing_id) return hit.listing_id as string;
      }

      // (3) media overlap against listings.media_photos (last-resort direct lookup)
      if (media.length) {
        const first = media[0];
        const { data: listingHit } = await supabase
          .from('listings')
          .select('id, media_photos')
          .contains('media_photos', [first])
          .limit(1)
          .maybeSingle();
        if ((listingHit as any)?.id) return (listingHit as any).id as string;
      }
      return null;
    } catch {
      return null;
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      // Prefer the listing_id persisted on the campaign row (written by
      // ayrshare-post into provider_response.listing_id). Fall back to the
      // heuristic resolver only when it's missing (older rows).
      const selectedListingId = campaign.listing_id || (await resolveListingId());

      // If we cannot tie this post back to a real listing, we refuse to
      // regenerate — the master template requires real property facts, and
      // running the generic path here is exactly what produces the broker
      // "בעולם הנדל״ן..." fluff the user is trying to eliminate.
      if (!selectedListingId) {
        toast.error('לא זוהה הנכס המקורי לפוסט', {
          description: 'ערוך את הטקסט ידנית או צור פוסט חדש מדף הקמפיינים עם בחירת נכס.',
        });
        return;
      }

      // Same invocation shape as CampaignCenter.handleGenerate — one unified
      // generation engine, with listingFocusOnly forced so the edge function
      // takes the strict 5-block master-template path.
      const rotateNote = [
        'נסח מחדש את הפוסט תוך שמירה קפדנית על תבנית המאסטר של אודי (5 בלוקים בלבד, בסדר הזה):',
        '1) פתיח לוכד "🏡✨ <סוג הנכס + חדרים + עיר>" — משפט אחד קצר.',
        '2) 1-2 משפטים על גודל, קומה, נוף/פיצ׳ר בולט ושדרוגים.',
        '3) "🌇 <שכונה/רחוב + נגישות ונוחות>".',
        '4) "💫 <יתרון אורח חיים>".',
        '5) "מחיר מבוקש: <סכום>. 📞 מוזמנים ליצור קשר לתיאום ביקור!" — מחיר ו-CTA באותה שורה.',
        'אסור לחלוטין: פסקאות פתיחה כלליות על "בתחום הנדל״ן", "בעולם הנדל״ן", "כמתווך", "בתור מתווך", "אני אודי", "יש לי הכבוד", "אני שמח/גאה להציג", וכל הצגה עצמית או סלוגן שיווקי. נכנסים ישר לנכס.',
        'אסור בהחלט להוסיף שורת מילות מפתח עם | בגוף הפוסט, ואסור האשטגים.',
        'אסור לכלול מספרי בית/דירה/כניסה בכתובת — שם רחוב בלבד.',
        'שמור על אותן עובדות מהנכס (מחיר, חדרים, מ״ר, קומה, שם רחוב) — אל תמציא נתונים.',
        'החתימה הקנונית (byline, ר.מ, WhatsApp, שיחה טלפונית) תתווסף אוטומטית בשרת — אל תכתוב אותה בעצמך.',
        'גוון פתיח, ניסוח ו-CTA לעומת הגרסה הקודמת כדי להימנע מחזרה.',
      ].join('\n');

      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: 'פוסט קידום נכס (רענון תבנית מאסטר)',
          platform: campaign.channel,
          customInstructions: rotateNote,
          selectedListingId,
          listingFocusOnly: true,
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

  const repost = async () => {
    if (!body.trim()) {
      toast.error('אין תוכן לפרסום');
      return;
    }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-post', {
        body: {
          post: body.trim(),
          channels: [campaign.channel],
          campaign_name: `${campaign.campaign_name} · שוכפל`,
          media_urls: mediaUrls,
          listing_id: campaign.listing_id ?? null,
        },
      });
      if (error) throw error;
      const errText = (data as any)?.error;
      if (errText) throw new Error(errText);
      toast.success('הפוסט פורסם מחדש');
      onPosted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('פרסום מחדש נכשל', { description: e?.message });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>עריכה ופרסום מחדש</DialogTitle>
          <DialogDescription>
            התמונות המקוריות נשמרות. נסח מחדש את הטקסט או ערוך ידנית, ואז פרסם שוב לאותו ערוץ.
          </DialogDescription>
        </DialogHeader>

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
          <Button onClick={repost} disabled={posting || regenerating || !body.trim()}>
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            פרסם מחדש
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
