import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Megaphone, Sparkles, Send, Home, Globe, MessageSquare, Mail, Smartphone, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ProjectAlternativesCard } from '@/components/properties/ProjectAlternativesCard';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  city: string | null;
};

type InternalListing = {
  id: string;
  property_title: string;
  description: string;
  asking_price: number | null;
};

type HomelyListing = {
  id: string;
  title: string;
  city?: string;
  price?: number | string;
};

type Draft = {
  subject: string;
  message: string;
  highlights: string[];
  call_to_action: string;
};

type Channel = 'whatsapp' | 'email' | 'sms';

interface ListingOutreachDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultLeadId?: string | null;
  defaultListingId?: string | null;
  defaultSource?: 'internal' | 'homely';
}

export function ListingOutreachDialog({
  open,
  onOpenChange,
  defaultLeadId,
  defaultListingId,
  defaultSource,
}: ListingOutreachDialogProps) {
  const [source, setSource] = useState<'internal' | 'homely'>(defaultSource ?? 'internal');
  const [leadId, setLeadId] = useState<string>('');
  const [listingId, setListingId] = useState<string>('');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [agentNote, setAgentNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (defaultLeadId) setLeadId(defaultLeadId);
  }, [defaultLeadId]);

  useEffect(() => {
    if (open && defaultListingId) {
      setListingId(defaultListingId);
      if (defaultSource) setSource(defaultSource);
    }
  }, [open, defaultListingId, defaultSource]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setListingId('');
      setAgentNote('');
    }
  }, [open]);


  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ['outreach-leads'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city')
        .eq('is_demo', false)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });

  const { data: internalListings, isLoading: loadingInternal } = useQuery({
    queryKey: ['outreach-internal-listings'],
    enabled: open && source === 'internal',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, description, asking_price')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as InternalListing[];
    },
  });

  const { data: homelyListings, isLoading: loadingHomely, error: homelyError } = useQuery({
    queryKey: ['outreach-homely-listings'],
    enabled: open && source === 'homely',
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('call-homely-api', {
        body: { path: '/listings', method: 'GET', query: { limit: '50' } },
      });
      if (error) throw error;
      const raw = (data as any)?.data ?? data ?? [];
      const items = Array.isArray(raw) ? raw : raw?.listings || raw?.results || [];
      return items.map((l: any) => ({
        id: String(l.id ?? l._id ?? l.uuid),
        title: l.title || l.address || `נכס ${l.id}`,
        city: l.city,
        price: l.price ?? l.asking_price,
      })) as HomelyListing[];
    },
  });

  const selectedLead = useMemo(
    () => leads?.find((p) => p.id === leadId),
    [leads, leadId],
  );

  const { data: selectedProjectName } = useQuery({
    queryKey: ['outreach-listing-project', source, listingId],
    enabled: source === 'internal' && !!listingId,
    queryFn: async () => {
      const { data } = await supabase
        .from('listings')
        .select('project_name')
        .eq('id', listingId)
        .maybeSingle();
      return (data as any)?.project_name as string | null;
    },
  });

  async function handleGenerate() {
    if (!leadId || !listingId) {
      toast.error('יש לבחור לקוח ונכס תחילה');
      return;
    }
    setGenerating(true);
    setDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-outreach-message', {
        body: {
          lead_id: leadId,
          listing_id: listingId,
          listing_source: source,
          channel,
          agent_note: agentNote || undefined,
        },
      });
      if (error) throw error;
      const d = (data as any)?.draft as Draft | undefined;
      if (!d?.message) throw new Error('הוחזרה טיוטה ריקה');
      setDraft(d);
      toast.success('טיוטת פנייה נוצרה — עברו עליה לפני שליחה');
    } catch (err: any) {
      console.error(err);
      toast.error('יצירת הטיוטה נכשלה', { description: err?.message });
    } finally {
      setGenerating(false);
    }
  }

  async function handleApproveSend() {
    if (!draft || !selectedLead) return;
    setSending(true);
    try {
      const fullText =
        channel === 'email' && draft.subject
          ? `${draft.subject}\n\n${draft.message}`
          : draft.message;

      if (channel === 'whatsapp') {
        // Immediate WhatsApp send via the connected GreenAPI (or WBA) gateway.
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            lead_id: selectedLead.id,
            phone_number: selectedLead.phone_number,
            message: fullText,
            ai_assisted: true,
          },
        });
        if (error) throw error;
        const res = data as { success?: boolean; provider?: string; error?: string } | null;
        if (!res?.success) throw new Error(res?.error || 'GreenAPI send failed');
        toast.success(`נשלח ב-WhatsApp${res.provider ? ` (${res.provider})` : ''}`);
        onOpenChange(false);
        return;
      }

      const { error } = await supabase.functions.invoke('send-message', {
        body: {
          lead_id: selectedLead.id,
          content: fullText,
          channel,
          phone_number: selectedLead.phone_number,
        },
      });
      if (error) throw error;
      toast.success('נשלח לתור האישור', {
        description: 'הפנייה ממתינה לאישור סופי לפני שליחה.',
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error('שליחת הפנייה נכשלה', { description: err?.message });
    } finally {
      setSending(false);
    }
  }

  const channelIcon = {
    whatsapp: MessageSquare,
    email: Mail,
    sms: Smartphone,
  }[channel];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-full max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            פנייה לנכס
          </DialogTitle>
          <DialogDescription>
            התאימו לקוח לנכס. ה-AI יכין הודעה מותאמת אישית — אתם מאשרים לפני שליחה.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lead picker */}
          <div className="space-y-2">
            <Label>לקוח</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingLeads ? 'טוען…' : 'בחרו לקוח'} />
              </SelectTrigger>
              <SelectContent>
                {leads?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || 'ללא שם'} {p.city ? `· ${p.city}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channel */}
          <div className="space-y-2">
            <Label>ערוץ</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">אימייל</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Listing source tabs */}
        <Tabs value={source} onValueChange={(v) => { setSource(v as any); setListingId(''); }}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="internal" className="gap-1.5">
              <Home className="h-4 w-4" /> הנכסים שלי
            </TabsTrigger>
            <TabsTrigger value="homely" className="gap-1.5">
              <Globe className="h-4 w-4" /> Homely
            </TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="mt-3">
            {loadingInternal ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : (internalListings?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">אין נכסים מפורסמים עדיין.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {internalListings!.map((l) => (
                  <Card
                    key={l.id}
                    className={cn(
                      'p-3 cursor-pointer transition-all border',
                      listingId === l.id && source === 'internal'
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'hover:border-primary/40',
                    )}
                    onClick={() => setListingId(l.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{l.property_title}</div>
                        <div className="text-xs text-muted-foreground truncate">{l.description}</div>
                      </div>
                      {l.asking_price ? (
                        <Badge variant="secondary" className="shrink-0">
                          ₪{Number(l.asking_price).toLocaleString()}
                        </Badge>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="homely" className="mt-3">
            {loadingHomely ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : homelyError ? (
              <p className="text-sm text-destructive py-6 text-center">
                לא ניתן להגיע ל-Homely — בדקו את מפתח ה-API בהגדרות.
              </p>
            ) : (homelyListings?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">לא הוחזרו נכסי Homely.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {homelyListings!.map((l) => (
                  <Card
                    key={l.id}
                    className={cn(
                      'p-3 cursor-pointer transition-all border',
                      listingId === l.id && source === 'homely'
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'hover:border-primary/40',
                    )}
                    onClick={() => setListingId(l.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{l.title}</div>
                        {l.city && <div className="text-xs text-muted-foreground">{l.city}</div>}
                      </div>
                      {l.price ? (
                        <Badge variant="secondary" className="shrink-0">
                          ₪{Number(l.price).toLocaleString()}
                        </Badge>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="agent-note">הערת סוכן</Label>
          <Input
            id="agent-note"
            value={agentNote}
            onChange={(e) => setAgentNote(e.target.value)}
            placeholder="לדוגמה: ציינו את הפחתת המחיר האחרונה, הדגישו את אזור הרישום לבי״ס"
            maxLength={500}
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!leadId || !listingId || generating}
          className="w-full"
        >
          <Sparkles className="h-4 w-4 ml-2" />
          {generating ? 'מנסח עם AI…' : 'הפקת פנייה'}
        </Button>

        {/* Preview */}
        {selectedProjectName && (
          <ProjectAlternativesCard
            currentListingId={listingId}
            projectName={selectedProjectName}
            compact
          />
        )}

        {(generating || draft) && (
          <Card className="p-4 bg-muted/30 border-dashed">
            <div className="flex items-center gap-2 mb-3">
              {(() => {
                const Icon = channelIcon;
                return <Icon className="h-4 w-4 text-primary" />;
              })()}
              <h3 className="font-medium text-sm">תצוגה מקדימה — {channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'אימייל' : 'SMS'}</h3>
            </div>

            {generating ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            ) : draft ? (
              <div className="space-y-3">
                {channel === 'email' && (
                  <div>
                    <Label className="text-xs">נושא</Label>
                    <Input
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">הודעה</Label>
                  <Textarea
                    value={draft.message}
                    onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                    rows={channel === 'sms' ? 4 : 8}
                    dir="rtl"
                    className="font-medium leading-relaxed"
                  />
                </div>
                {draft.highlights?.length > 0 && (
                  <div>
                    <Label className="text-xs">נקודות מפתח</Label>
                    <ul className="text-xs text-muted-foreground space-y-1 mt-1" dir="rtl">
                      {draft.highlights.map((h, i) => (
                        <li key={i} className="flex gap-1.5">
                          <Check className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={handleGenerate} disabled={generating}>
                    <Sparkles className="h-4 w-4 ml-1.5" />
                    הפקה מחדש
                  </Button>
                  <Button className="flex-1" onClick={handleApproveSend} disabled={sending}>
                    <Send className="h-4 w-4 ml-1.5" />
                    {sending ? 'שולח…' : channel === 'whatsapp' ? 'שלח עכשיו ב-WhatsApp' : 'אישור ושליחה'}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
