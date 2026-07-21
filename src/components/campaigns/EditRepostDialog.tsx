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
 * copy through the AI content pipeline (or hand-edit it), then re-publish
 * to the same channel. Media is preserved verbatim.
 */
export default function EditRepostDialog({ open, onOpenChange, campaign, onPosted }: Props) {
  const [body, setBody] = useState(campaign.message_body ?? '');
  const [regenerating, setRegenerating] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (open) setBody(campaign.message_body ?? '');
  }, [open, campaign.message_body]);

  const mediaUrls = Array.isArray(campaign.media_urls) ? campaign.media_urls : [];

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const templateInstructions = [
        'נסח מחדש את הפוסט בפורמט המאסטר של אודי — קצר, נקי, משכנע, בסדר קבוע ובמרווח שורה ריקה בין הבלוקים:',
        '1) "🏡✨ פתיח לוכד עם סוג הנכס + חדרים + עיר" (משפט אחד קצר).',
        '2) פסקה קצרה של 1-2 משפטים על שטח, קומה, נוף ופיצ\'ר בולט.',
        '3) "🌇 שכונה/רחוב + נוחות (תחבורה, ים, פארק, מסחר)".',
        '4) "💫 יתרון אורח חיים".',
        '5) שורת מחיר בדיוק בפורמט: "מחיר מבוקש: <סכום>."',
        '6) שורת CTA: "📞 מוזמנים ליצור קשר לתיאום ביקור!" (ניתן לגוון מעט את הנוסח אך תמיד קצר עם 📞).',
        'אסור: בולטים ✅, שורות 📍 או 💰, שורת מילות מפתח (|), האשטגים, סוגריים מרובעים, em-dash, מקפים כפולים, אימוג\'ים דקורטיביים אחרים, וכל אזכור של תוכנה/AI.',
        'שמור על אותן עובדות, מחיר, שם רחוב, מספרי חדרים ומ"ר כמו בפוסט המקורי — אל תמציא נתונים ואל תשנה אותם. פשוט נסח מחדש בטון טרי ובזווית שונה.',
        `הפוסט המקורי לניסוח מחדש:\n"""${campaign.message_body ?? ''}"""`,
      ].join('\n');

      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: `נסח מחדש את הפוסט בפורמט המאסטר של אודי`,
          platform: campaign.channel,
          customInstructions: templateInstructions,
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
