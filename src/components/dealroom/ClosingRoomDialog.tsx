import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Send, Clock, CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { publicUrl } from '@/lib/publicUrl';

type TemplateKey = 'offer_letter' | 'lease_agreement';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  interest_tag?: string | null;
};

type ClosingDoc = {
  id: string;
  title: string;
  template_key: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
  sign_token: string;
  sent_at: string | null;
  signed_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
};

type Listing = {
  id: string;
  property_title: string;
  asking_price: number | null;
};

const STATUS_BADGE: Record<ClosingDoc['status'], { label: string; tone: string; icon: typeof Clock }> = {
  draft: { label: 'טיוטה', tone: 'bg-muted text-muted-foreground', icon: FileText },
  sent: { label: 'ממתין לחתימה', tone: 'bg-warning/15 text-warning-foreground border border-warning/30', icon: Clock },
  viewed: { label: 'נצפה', tone: 'bg-primary/10 text-primary', icon: Clock },
  signed: { label: 'נחתם', tone: 'bg-success/15 text-success border border-success/30', icon: CheckCircle2 },
  expired: { label: 'פג תוקף', tone: 'bg-destructive/10 text-destructive', icon: Clock },
  cancelled: { label: 'בוטל', tone: 'bg-muted text-muted-foreground', icon: Clock },
};

export function ClosingRoomDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState<TemplateKey>('offer_letter');
  const [listingId, setListingId] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [terms, setTerms] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemplate('offer_letter');
      setListingId('');
      setPrice('');
      setTerms('');
    }
  }, [open]);

  const { data: listings = [] } = useQuery({
    queryKey: ['listings-mini'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, asking_price')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Listing[];
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ['closing-docs', lead?.id],
    enabled: !!lead && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closing_documents')
        .select('id, title, template_key, status, sign_token, sent_at, signed_at, reminder_sent_at, created_at')
        .eq('lead_id', lead!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClosingDoc[];
    },
  });

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === listingId),
    [listings, listingId],
  );

  useEffect(() => {
    if (selectedListing?.asking_price && !price) {
      setPrice(String(selectedListing.asking_price));
    }
  }, [selectedListing, price]);

  async function generateAndSend() {
    if (!lead || busy) return;
    setBusy(true);
    try {
      const { data: gen, error: genErr } = await supabase.functions.invoke('generate-closing-doc', {
        body: {
          lead_id: lead.id,
          template_key: template,
          listing_id: listingId || undefined,
          terms: terms.trim() || undefined,
          price_override: price ? Number(price) : undefined,
        },
      });
      if (genErr) throw genErr;
      const documentId = (gen as any)?.document_id;
      if (!documentId) throw new Error('לא הוחזר מזהה מסמך');

      const { data: sendRes, error: sendErr } = await supabase.functions.invoke('send-closing-doc', {
        body: {
          document_id: documentId,
          site_url: window.location.origin,
        },
      });
      if (sendErr) throw sendErr;

      toast.success('המסמך נשלח לחתימה', {
        description: `${lead.full_name || 'הלקוח'} יקבל קישור ב-WhatsApp לעיון וחתימה.`,
      });
      queryClient.invalidateQueries({ queryKey: ['closing-docs', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
    } catch (e: any) {
      toast.error('שליחת המסמך נכשלה', { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    const url = publicUrl(`/sign/${token}`);
    navigator.clipboard.writeText(url);
    toast.success('קישור החתימה הועתק');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            חדר סגירה דיגיטלי
          </DialogTitle>
          <DialogDescription>
            הפיקו מסמך מוכן עבור {lead?.full_name || 'הלקוח'} ושלחו אותו לחתימה מאובטחת ב-WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">תבנית</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offer_letter">הצעת רכישה</SelectItem>
                <SelectItem value="lease_agreement">חוזה שכירות</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">נכס מקושר (אופציונלי)</Label>
            <Select value={listingId || 'none'} onValueChange={(v) => setListingId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="ללא" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ללא —</SelectItem>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.property_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">
              {template === 'offer_letter' ? 'מחיר הצעה (₪)' : 'מחיר ייחוס (₪)'}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="לדוגמה: 850000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">סעיפים מותאמים (אופציונלי)</Label>
            <Textarea
              rows={3}
              placeholder="השאירו ריק כדי להשתמש בסעיף הסטנדרטי של התבנית."
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              maxLength={4000}
            />
          </div>

          {docs.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-3 py-2 text-xs font-medium border-b bg-muted/40">
                היסטוריית מסמכים
              </div>
              <div className="divide-y max-h-44 overflow-y-auto">
                {docs.map((d) => {
                  const meta = STATUS_BADGE[d.status];
                  const Icon = meta.icon;
                  return (
                    <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {d.signed_at
                            ? `נחתם ב-${new Date(d.signed_at).toLocaleString('he-IL')}`
                            : d.sent_at
                              ? `נשלח ב-${new Date(d.sent_at).toLocaleString('he-IL')}${d.reminder_sent_at ? ' · נשלחה תזכורת' : ''}`
                              : `נוצר ב-${new Date(d.created_at).toLocaleString('he-IL')}`}
                        </p>
                      </div>
                      <Badge className={`${meta.tone} text-[10px] px-2 py-0`} variant="outline">
                        {meta.label}
                      </Badge>
                      {d.status !== 'signed' && d.status !== 'expired' && (
                        <Button size="sm" variant="ghost" onClick={() => copyLink(d.sign_token)}>
                          העתק קישור
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ביטול
          </Button>
          <Button onClick={generateAndSend} disabled={busy || !lead}>
            <Send className="h-4 w-4 ml-1.5" />
            {busy ? 'מפיק ושולח…' : 'הפקה ושליחה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
