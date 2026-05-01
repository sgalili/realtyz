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
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground', icon: FileText },
  sent: { label: 'Awaiting signature', tone: 'bg-warning/15 text-warning-foreground border border-warning/30', icon: Clock },
  viewed: { label: 'Viewed', tone: 'bg-primary/10 text-primary', icon: Clock },
  signed: { label: 'Signed', tone: 'bg-success/15 text-success border border-success/30', icon: CheckCircle2 },
  expired: { label: 'Expired', tone: 'bg-destructive/10 text-destructive', icon: Clock },
  cancelled: { label: 'Cancelled', tone: 'bg-muted text-muted-foreground', icon: Clock },
};

export function ClosingRoomDialog({
  prospect,
  open,
  onOpenChange,
}: {
  prospect: Lead | null;
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
    queryKey: ['closing-docs', prospect?.id],
    enabled: !!prospect && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closing_documents')
        .select('id, title, template_key, status, sign_token, sent_at, signed_at, reminder_sent_at, created_at')
        .eq('lead_id', prospect!.id)
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
    if (!prospect || busy) return;
    setBusy(true);
    try {
      const { data: gen, error: genErr } = await supabase.functions.invoke('generate-closing-doc', {
        body: {
          lead_id: prospect.id,
          template_key: template,
          listing_id: listingId || undefined,
          terms: terms.trim() || undefined,
          price_override: price ? Number(price) : undefined,
        },
      });
      if (genErr) throw genErr;
      const documentId = (gen as any)?.document_id;
      if (!documentId) throw new Error('No document_id returned');

      const { data: sendRes, error: sendErr } = await supabase.functions.invoke('send-closing-doc', {
        body: {
          document_id: documentId,
          site_url: window.location.origin,
        },
      });
      if (sendErr) throw sendErr;

      toast.success('Document sent for signature', {
        description: `${prospect.full_name || 'Prospect'} will get the WhatsApp link to review and sign.`,
      });
      queryClient.invalidateQueries({ queryKey: ['closing-docs', prospect.id] });
      queryClient.invalidateQueries({ queryKey: ['deal-room-prospects'] });
    } catch (e: any) {
      toast.error('Could not send document', { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Sign link copied');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="ltr">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Digital Closing Room
          </DialogTitle>
          <DialogDescription>
            Generate a pre-filled document for {prospect?.full_name || 'this prospect'} and send it for secure signature via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Template</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as TemplateKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offer_letter">Offer Letter</SelectItem>
                <SelectItem value="lease_agreement">Lease Agreement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Linked listing (optional)</Label>
            <Select value={listingId || 'none'} onValueChange={(v) => setListingId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
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
              {template === 'offer_letter' ? 'Offer price (USD)' : 'Reference price (USD)'}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="e.g. 850000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Custom terms (optional)</Label>
            <Textarea
              rows={3}
              placeholder="Leave blank to use the standard clause for this template."
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              maxLength={4000}
            />
          </div>

          {docs.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-3 py-2 text-xs font-medium border-b bg-muted/40">
                Document history
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
                            ? `Signed ${new Date(d.signed_at).toLocaleString()}`
                            : d.sent_at
                              ? `Sent ${new Date(d.sent_at).toLocaleString()}${d.reminder_sent_at ? ' · reminder sent' : ''}`
                              : `Created ${new Date(d.created_at).toLocaleString()}`}
                        </p>
                      </div>
                      <Badge className={`${meta.tone} text-[10px] px-2 py-0`} variant="outline">
                        {meta.label}
                      </Badge>
                      {d.status !== 'signed' && d.status !== 'expired' && (
                        <Button size="sm" variant="ghost" onClick={() => copyLink(d.sign_token)}>
                          Copy link
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
            Cancel
          </Button>
          <Button onClick={generateAndSend} disabled={busy || !prospect}>
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? 'Generating & sending…' : 'Generate & send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
