import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { downloadStrategicPdf, getStrategicPdfBlob } from '@/lib/strategicPdf';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type StrategicPdfExportButtonProps = {
  supporters?: number;
  mandateTarget?: number;
  progressPct?: number;
  sentiment?: { positive: number; neutral: number; negative: number };
  archetype?: string | null;
  compact?: boolean;
  className?: string;
};

export function StrategicPdfExportButton({
  supporters = 164_281,
  mandateTarget = 12,
  progressPct = 45,
  sentiment = { positive: 6420, neutral: 2740, negative: 1840 },
  archetype,
  compact = false,
  className,
}: StrategicPdfExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);

  const buildWhatsappFollowUp = (fullName: string) => `שלום ${fullName || '[שם המשתמש]'}, כאן ה-AI של Realtyz. 🚀

הדוח האסטרטגי שלך מוכן והורד כרגע למכשיר שלך.

ניתחנו עבורך את מגמות הסנטימנט האחרונות וזיהינו פוטנציאל לצמיחה של כ-2.4 עסקאות באמצעות אופטימיזציה של מסרי הביטחון והכלכלה.

אני זמין כאן לכל שאלה על הדוח או כדי לתאם לך שיחת ייעוץ אסטרטגית עם הצוות שלנו.

בהצלחה בדרך לניצחון! 🗳️`;

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const formatWhatsappDisplay = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.startsWith('9725') ? `0${digits.slice(3)}` : digits.startsWith('5') ? `0${digits}` : digits;
    const limited = localDigits.slice(0, 10);
    return limited.length > 3 ? `${limited.slice(0, 3)}-${limited.slice(3)}` : limited;
  };

  const normalizeWhatsappForSend = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (/^05\d{8}$/.test(digits)) return digits;
    if (/^5\d{8}$/.test(digits)) return `0${digits}`;
    if (/^9725\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedWhatsapp = normalizeWhatsappForSend(whatsapp);
    if (!normalizedWhatsapp) {
      toast.error('יש להזין מספר WhatsApp ישראלי תקין');
      return;
    }
    setLoading(true);
    try {
      const messageToSend = buildWhatsappFollowUp(name);
      const pdfData = {
        name,
        supporters,
        mandateTarget,
        progressPct,
        sentiment,
        topics: ['#יוקר_המחיה', '#ביטחון_אישי', '#חינוך', '#דיור', '#מתלבטים'],
        advice: [
          'למקד את 72 השעות הקרובות בקהלי מתלבטים בערים עם פער חיובי-שלילי קטן.',
          'להפעיל מסר כלכלי קצר ב-WhatsApp לפני קמפיין רחב כדי למדוד תגובת שטח אמיתית.',
          'להצמיד לכל נושא חם תשובת AI מאושרת מראש כדי לצמצם זמן תגובה למשברים.',
        ],
      };
      const sessionId = window.localStorage.getItem('kalpiz-demo-session-id') ?? crypto.randomUUID();
      window.localStorage.setItem('kalpiz-demo-session-id', sessionId);
      const { error } = await (supabase as any).from('demo_captured_leads').insert({
        phone_number: normalizedWhatsapp,
        session_id: sessionId,
        archetype,
        value_trap_type: 'strategic_pdf_export',
        engagement_score: 95,
        metadata: { source: 'dashboard_pdf_export', full_name: name, supporters, mandateTarget, progressPct, whatsapp_follow_up: messageToSend },
      });
      if (error) throw error;

      const pdfBlob = await getStrategicPdfBlob(pdfData);
      const pdfBase64 = await blobToBase64(pdfBlob);
      const fileName = `kalpiz-strategic-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      const { error: sendError } = await supabase.functions.invoke('send-strategic-pdf-whatsapp', {
        body: { phone_number: normalizedWhatsapp, message: messageToSend, file_name: fileName, pdf_base64: pdfBase64 },
      });
      if (sendError) throw sendError;

      await downloadStrategicPdf(pdfData);
      toast.success('הדוח נשלח ל-WhatsApp והורד למכשיר');
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'הפקת הדוח נכשלה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('bg-primary-glow text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary-glow/90', compact ? 'h-10 w-10 px-0' : 'w-full', className)}
        title="הפק דוח אסטרטגי (PDF)"
      >
        <FileDown className="h-4 w-4" />
        {!compact && <span>הפק דוח אסטרטגי (PDF)</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="auth-panel max-w-md overflow-hidden">
          <DialogHeader className="text-right">
            <DialogTitle className="text-xl font-black text-primary">ניתוח עסקאות ואסטרטגיה</DialogTitle>
            <DialogDescription>
              ה-AI מנתח את נתוני הקמפיין שלך. הדוח המלא כולל תחזית צמיחה, ניתוח סנטימנט והמלצות אופרטיביות ישלח אליך כעת.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="strategic-pdf-name">שם מלא</Label>
              <Input id="strategic-pdf-name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="השם שלך" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategic-pdf-whatsapp">מספר WhatsApp</Label>
              <Input id="strategic-pdf-whatsapp" dir="ltr" type="tel" inputMode="tel" value={whatsapp} onChange={(event) => setWhatsapp(formatWhatsappDisplay(event.target.value))} required placeholder="05X-XXXXXXX" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'שולח דוח ל-WhatsApp...' : 'שלחו לי דוח בווטסאפ'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}