import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import {
  ArrowRight, Plus, Bot, Mail, Phone, MessageSquare, Heart, Share2,
  ChevronDown, ChevronUp, Archive, Radio,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TabValue = 'create' | 'published' | 'responses';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'create',    label: 'צור קמפיין' },
  { value: 'published', label: 'פורסמו' },
  { value: 'responses', label: 'תגובות' },
];

type ChannelCard = {
  id: string;
  label: string;
  price?: string;
  priceUnit?: string;
  free?: boolean;
  brand?: string;
  icon?: typeof Bot;
  iconColor?: string;
};

const CHANNEL_CARDS: ChannelCard[] = [
  { id: 'x',         label: 'X',          free: true, brand: 'x' },
  { id: 'instagram', label: 'Instagram',  free: true, brand: 'instagram' },
  { id: 'facebook',  label: 'Facebook',   free: true, brand: 'facebook' },
  { id: 'ai-call',   label: 'שיחת AI',    price: '1.00', priceUnit: 'לדקה',   icon: Bot,   iconColor: 'text-amber-500' },
  { id: 'email',     label: 'אימייל',     price: '0.01', priceUnit: 'לנמען',  icon: Mail,  iconColor: 'text-rose-500' },
  { id: 'ivr',       label: 'IVR',        price: '0.20', priceUnit: 'לדקה',   icon: Phone, iconColor: 'text-purple-500' },
  { id: 'youtube',   label: 'YouTube',    free: true, brand: 'youtube' },
  { id: 'linkedin',  label: 'LinkedIn',   free: true, brand: 'linkedin' },
  { id: 'tiktok',    label: 'TikTok',     free: true, brand: 'tiktok' },
];

/* ───────────── Channel wizard dialog ───────────── */

const ChannelWizardDialog = ({
  channel, open, onClose,
}: { channel: ChannelCard | null; open: boolean; onClose: () => void }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'hot' | 'recent'>('all');
  const [sending, setSending] = useState(false);
  const { settings } = useWhiteLabel();
  const brandName = settings?.agency_name || 'Realtyz AI';

  useEffect(() => {
    if (open) { setTitle(''); setBody(''); setAudience('all'); }
  }, [open, channel?.id]);

  if (!channel) return null;

  const handleSubmit = async () => {
    if (!body.trim()) { toast.error('יש לכתוב תוכן להודעה'); return; }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('not authenticated');
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, full_name, phone, email')
        .limit(audience === 'all' ? 100 : 25);
      if (error) throw error;
      const rows = (leads || []).map((l: any) => ({
        user_id: user.id,
        campaign_name: title.trim() || `${brandName} · ${channel.label}`,
        channel: channel.id,
        lead_id: l.id,
        recipient_phone: l.phone,
        recipient_email: l.email,
        recipient_name: l.full_name,
        message_body: body,
        status: 'queued' as const,
      }));
      if (rows.length === 0) {
        toast.info('אין מתעניינים תואמים — נשמר טיוטה');
      } else {
        const { error: insErr } = await supabase.from('campaign_logs').insert(rows);
        if (insErr) throw insErr;
        toast.success(`נשלח ל-${rows.length} מתעניינים בערוץ ${channel.label}`);
      }
      onClose();
    } catch (e) {
      toast.error('שליחה נכשלה: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">קמפיין חדש · {channel.label}</DialogTitle>
          <DialogDescription className="text-right">
            כתוב את ההודעה, בחר קהל יעד והפעל את הקמפיין.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-title">שם הקמפיין</Label>
            <Input id="campaign-title" value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder={`${brandName} · ${channel.label}`} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-body">תוכן ההודעה</Label>
            <Textarea id="campaign-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)}
                      placeholder="הקלד את התוכן שיישלח למתעניינים…" />
          </div>

          <div className="space-y-2">
            <Label>קהל יעד</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'all',    label: 'כל המתעניינים' },
                { id: 'hot',    label: 'חמים' },
                { id: 'recent', label: 'אחרונים' },
              ] as const).map((a) => (
                <button key={a.id} type="button" onClick={() => setAudience(a.id)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-sm transition',
                          audience === a.id
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-border bg-background hover:border-primary/40',
                        )}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {!channel.free && channel.price && (
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground flex justify-between">
              <span>עלות משוערת</span>
              <span dir="ltr" className="font-semibold text-foreground">
                <bdi dir="ltr">₪{channel.price}</bdi> {channel.priceUnit}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? 'שולח…' : 'הפעל קמפיין'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ChannelGrid = ({ onPick }: { onPick: (c: ChannelCard) => void }) => (
  <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {CHANNEL_CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <button key={c.id} type="button" onClick={() => onPick(c)}
            className="group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-3 text-center transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]">
            <span aria-hidden className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 group-hover:text-primary">
              <Plus className="h-4 w-4" />
            </span>
            <span className="flex h-8 w-8 items-center justify-center">
              {c.brand ? <BrandIcon name={c.brand} className="h-7 w-7" />
                       : Icon ? <Icon className={`h-7 w-7 ${c.iconColor ?? 'text-foreground'}`} /> : null}
            </span>
            <span className="text-sm font-semibold text-foreground leading-tight">{c.label}</span>
            {c.free ? (
              <span className="text-xs font-bold text-primary">חינם</span>
            ) : (
              <>
                <span className="text-sm font-bold text-foreground" dir="ltr">
                  <bdi dir="ltr">₪{c.price}</bdi>
                </span>
                <span className="text-[11px] text-muted-foreground">{c.priceUnit}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

/* ───────────── Tab 2: Published feed ───────────── */

type CampaignRow = {
  id: string;
  campaign_name: string;
  channel: string;
  message_body: string | null;
  created_at: string;
  recipient_count?: number;
};

const PublishedFeed = () => {
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRows([]); return; }
      const { data } = await supabase
        .from('campaign_logs')
        .select('id, campaign_name, channel, message_body, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      const grouped = new Map<string, CampaignRow>();
      (data || []).forEach((r: any) => {
        const key = `${r.campaign_name}|${r.channel}|${r.created_at.slice(0, 16)}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.recipient_count = (existing.recipient_count || 1) + 1;
        } else {
          grouped.set(key, { ...r, recipient_count: 1 });
        }
      });
      setRows(Array.from(grouped.values()));
    })();
  }, []);

  if (rows === null) {
    return <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">טוען…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
        <p className="text-sm font-semibold text-foreground">עדיין אין קמפיינים שפורסמו</p>
        <p className="mt-1 text-xs text-muted-foreground">לאחר שתפעיל קמפיין מהטאב "צור קמפיין", הוא יופיע כאן עם מעקב לייקים, שיתופים ותגובות.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const isOpen = expanded[r.id] ?? true;
        const dt = new Date(r.created_at);
        const dateStr = dt.toLocaleDateString('he-IL') + ', ' + dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        return (
          <article key={r.id} className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <header className="flex items-start justify-between gap-3 p-4">
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded((s) => ({ ...s, [r.id]: !isOpen }))}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="ארכיון">
                  <Archive className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 text-right">
                <h3 className="font-semibold text-foreground">{r.campaign_name}</h3>
                <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>{r.recipient_count} נמענים</span>
                  <span>·</span>
                  <span>{dateStr}</span>
                  <span>·</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{r.channel}</span>
                </div>
              </div>
            </header>

            {isOpen && (
              <>
                <div className="mx-4 mb-3 rounded-xl border border-border bg-background p-4 text-sm text-foreground whitespace-pre-wrap text-right">
                  {r.message_body || <span className="text-muted-foreground">אין תוכן הודעה</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                  <Stat icon={MessageSquare} label="תגובות" value={0} />
                  <Stat icon={Share2}         label="שיתופים" value={0} />
                  <Stat icon={Heart}          label="לייקים"  value={0} />
                </div>
                <div className="border-t border-border bg-muted/30 px-4 py-3 text-right">
                  <p className="text-xs font-semibold text-foreground">תגובות לקמפיין</p>
                  <p className="mt-1 text-xs text-muted-foreground">אין תגובות עדיין לקמפיין זה</p>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: number }) => (
  <div className="rounded-xl border border-border bg-background px-3 py-2 flex items-center justify-between">
    <Icon className="h-4 w-4 text-muted-foreground" />
    <div className="text-right">
      <div className="text-sm font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  </div>
);

/* ───────────── Tab 3: Responses ───────────── */

const RESPONSE_CHANNELS: { id: string; label: string; brand: string }[] = [
  { id: 'all',       label: 'הכל',      brand: '' },
  { id: 'facebook',  label: 'Facebook', brand: 'facebook' },
  { id: 'instagram', label: 'Instagram',brand: 'instagram' },
  { id: 'x',         label: 'X',        brand: 'x' },
  { id: 'tiktok',    label: 'TikTok',   brand: 'tiktok' },
  { id: 'linkedin',  label: 'LinkedIn', brand: 'linkedin' },
];

const ResponsesView = () => {
  const [positiveHold, setPositiveHold] = useState(false);
  const [negativeHold, setNegativeHold] = useState(false);
  const [activeChannel, setActiveChannel] = useState<string>('all');

  const visible = activeChannel === 'all'
    ? RESPONSE_CHANNELS.filter((c) => c.id !== 'all')
    : RESPONSE_CHANNELS.filter((c) => c.id === activeChannel);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Switch checked={positiveHold} onCheckedChange={setPositiveHold} id="pos-hold" />
          <Label htmlFor="pos-hold" className="text-sm text-right">לתגובות חיוביות: המתנה לנציג</Label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Switch checked={negativeHold} onCheckedChange={setNegativeHold} id="neg-hold" />
          <Label htmlFor="neg-hold" className="text-sm text-right">לתגובות שליליות: המתנה לנציג</Label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-1 flex items-center gap-1 overflow-x-auto" dir="rtl">
        {RESPONSE_CHANNELS.map((c) => {
          const active = activeChannel === c.id;
          return (
            <button key={c.id} onClick={() => setActiveChannel(c.id)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition',
                active ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground hover:bg-muted',
              )}>
              {c.brand && <BrandIcon name={c.brand} className="h-3.5 w-3.5" />}
              <span>{c.label}</span>
              <span className={cn('text-[11px]', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>(0)</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {visible.map((c) => (
          <article key={c.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">0</span>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{c.label}</h3>
                {c.brand && <BrandIcon name={c.brand} className="h-5 w-5" />}
              </div>
            </header>
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-foreground">אין אינטראקציות להצגה כרגע</p>
              <p className="mt-1 text-xs text-muted-foreground">ברגע שהחיבור יאומת ויגיעו נתונים, הפיד יתעדכן כאן אוטומטית.</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/* ───────────── Page ───────────── */

const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pickedChannel, setPickedChannel] = useState<ChannelCard | null>(null);

  const initial = (searchParams.get('tab') as string) ?? 'create';
  const remapped: TabValue =
    initial === 'campaigns' || initial === 'strategy' || initial === 'send' || initial === 'broadcast'
      ? 'create'
      : initial === 'calendar'
      ? 'published'
      : (initial as TabValue);
  const active: TabValue = TABS.some((t) => t.value === remapped) ? remapped : 'create';

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  const leadId = searchParams.get('lead') ?? searchParams.get('client') ?? searchParams.get('voter');
  const leadNameParam = searchParams.get('name');
  const fromRaw = searchParams.get('from');
  const fromCrm = fromRaw === 'crm' || fromRaw === 'voter-crm' || fromRaw === 'lead-crm';

  const [leadAvatar, setLeadAvatar] = useState<string | null>(null);
  const [leadFullName, setLeadFullName] = useState<string | null>(null);
  useEffect(() => {
    if (!leadId) { setLeadAvatar(null); setLeadFullName(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('leads').select('full_name, profile_picture_url').eq('id', leadId).maybeSingle();
      if (cancelled) return;
      setLeadAvatar((data as any)?.profile_picture_url ?? null);
      setLeadFullName((data as any)?.full_name ?? null);
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  const displayName = leadFullName ?? leadNameParam ?? '';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  const isTargetedMode = !!leadId && !!displayName;

  return (
    <div className="space-y-6" dir="rtl">
      {isTargetedMode && (
        <div className="relative -mx-3 sm:-mx-6 -mt-6 mb-2 overflow-hidden text-primary-foreground"
             style={{ backgroundColor: '#0096E6' }} data-no-hero-wave>
          <div className="relative z-10 grid items-center px-4 sm:px-6"
               style={{ minHeight: '88px', gridTemplateColumns: '1fr auto 1fr' }}>
            <div className="flex justify-start">
              <Button variant="ghost" size="icon"
                onClick={() => fromCrm ? navigate(`/lead-crm?lead=${encodeURIComponent(leadId!)}`) : navigate('/lead-crm')}
                className="text-primary-foreground hover:bg-primary-foreground/10" aria-label="חזרה לפרופיל המתעניין">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-primary-foreground/40 shrink-0">
                {leadAvatar ? <AvatarImage src={leadAvatar} alt={displayName} /> : null}
                <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap">{displayName}</h1>
            </div>
            <div />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6">
            <RealtyzWave position="bottom" variant="wave-soft" fill="#f1f5f9" seed={7} />
          </div>
        </div>
      )}

      <Tabs value={active} onValueChange={handleChange} className="w-full">
        <div className="sticky top-0 z-30 -mx-6 px-6 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
          <TabsList className="flex w-full h-auto gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="flex-1 min-w-fit whitespace-nowrap px-3 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="create" className="mt-6 space-y-6">
          <ChannelGrid onPick={setPickedChannel} />
        </TabsContent>
        <TabsContent value="published" className="mt-6">
          <PublishedFeed />
        </TabsContent>
        <TabsContent value="responses" className="mt-6">
          <ResponsesView />
        </TabsContent>
      </Tabs>

      <ChannelWizardDialog channel={pickedChannel} open={!!pickedChannel} onClose={() => setPickedChannel(null)} />
    </div>
  );
};

export default CampaignCenter;
