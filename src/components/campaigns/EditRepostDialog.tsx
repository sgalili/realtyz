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
  const resolveListingId = async (): Promise<string | null> => {
    try {
      const original = (campaign.message_body ?? '').trim();
      if (!original) return null;
      const { data } = await supabase
        .from('ai_content_logs')
        .select('listing_id, generated_text, created_at')
        .eq('platform', campaign.channel)
        .order('created_at', { ascending: false })
        .limit(25);
      const hit = (data ?? []).find((r: any) => {
        const t = String(r?.generated_text ?? '').trim();
        if (!t || !r?.listing_id) return false;
        return t === original || original.startsWith(t.slice(0, 80)) || t.startsWith(original.slice(0, 80));
      });
      return (hit as any)?.listing_id ?? null;
    } catch {
      return null;
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const selectedListingId = await resolveListingId();

      // Same invocation shape as CampaignCenter.handleGenerate — one unified
      // generation engine. `rotateTemplate`-style note asks the model to vary
      // the master template while keeping the exact 5-block structure.
      const rotateNote = [
        'נסח מחדש את הפוסט תוך שמירה קפדנית על תבנית המאסטר של אודי (5 בלוקים בלבד, בסדר הזה):',
        '1) פתיח לוכד עם סוג הנכס + חדרים + עיר (בלי מספרי בית ובלי מספרי רחוב).',
        '2) גודל, קומה, נוף/פיצ׳ר בולט ושדרוגים.',
        '3) שכונה/רחוב + נגישות ונוחות.',
        '4) יתרון אורח חיים.',
        '5) שורת "מחיר מבוקש: <סכום>." ואחריה CTA קצר לתיאום ביקור.',
        'אל תוסיף פסקאות פתיחה כלליות על "בתחום הנדל״ן", על מקצוע התיווך או על אודי — אין הקדמות, אין סלוגנים, אין הצהרות שיווקיות. ישר לעניין, על הנכס בלבד.',
        'שמור על אותן עובדות (מחיר, חדרים, מ״ר, קומה, שם רחוב ללא מספר) — אל תמציא נתונים.',
        'החתימה הקנונית (byline, ר.מ, WhatsApp, שיחה טלפונית) תתווסף אוטומטית בשרת — אל תכתוב אותה בעצמך.',
        'גוון פתיח, ניסוח ו-CTA לעומת הגרסה הקודמת כדי להימנע מחזרה.',
      ].join('\n');

      const topic = selectedListingId
        ? `פוסט קידום נכס (רענון תבנית מאסטר)`
        : (campaign.message_body ?? '').trim().slice(0, 200) || 'רענון פוסט קיים';

      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic,
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
