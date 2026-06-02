import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import {
  ArrowRight, Plus, Bot, Mail, Phone, MessageSquare, Heart, Share2,
  ChevronDown, ChevronUp, Archive, Send, Mic, Image as ImageIcon, Paperclip,
  ChevronDown as ChevronDownIcon, Plug, Camera, Sparkles, Square,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { supabase } from '@/integrations/supabase/client';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAuth } from '@/hooks/useAuth';
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

// Top row (RTL): Facebook → Instagram → X
// Middle row (RTL): IVR → Email → AI Voice
// Bottom row (RTL): YouTube → LinkedIn → TikTok
const CHANNEL_CARDS: ChannelCard[] = [
  { id: 'facebook',  label: 'Facebook',   free: true, brand: 'facebook' },
  { id: 'instagram', label: 'Instagram',  free: true, brand: 'instagram' },
  { id: 'x',         label: 'X',          free: true, brand: 'x' },
  { id: 'ivr',       label: 'IVR',        price: '0.20', priceUnit: 'לדקה',   icon: Phone, iconColor: 'text-purple-500' },
  { id: 'email',     label: 'אימייל',     price: '0.01', priceUnit: 'לנמען',  icon: Mail,  iconColor: 'text-rose-500' },
  { id: 'ai-call',   label: 'שיחת AI',    price: '1.00', priceUnit: 'לדקה',   icon: Bot,   iconColor: 'text-amber-500' },
  { id: 'youtube',   label: 'YouTube',    free: true, brand: 'youtube' },
  { id: 'linkedin',  label: 'LinkedIn',   free: true, brand: 'linkedin' },
  { id: 'tiktok',    label: 'TikTok',     free: true, brand: 'tiktok' },
];

// Channels considered "connected" by default in the workspace.
// Disconnected channels render dashed border + grayscale + a "חבר" CTA.
const DEFAULT_CONNECTED = new Set(['facebook', 'instagram', 'youtube', 'email', 'ivr', 'ai-call']);

// Official brand colors applied only when the channel is connected.
const BRAND_COLOR: Record<string, string> = {
  facebook:  'text-[#1877F2]',
  instagram: 'text-[#E1306C]',
  x:         'text-foreground',
  youtube:   'text-[#FF0000]',
  linkedin:  'text-[#0A66C2]',
  tiktok:    'text-foreground',
};

/* ───────────── Channel grid ───────────── */

const ChannelGrid = ({
  selectedId, onPick, brandName, connected = DEFAULT_CONNECTED,
}: {
  selectedId: string | null;
  onPick: (c: ChannelCard) => void;
  brandName: string;
  connected?: Set<string>;
}) => (
  <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
    <div className="grid grid-cols-3 gap-3 sm:gap-4" dir="rtl">
      {CHANNEL_CARDS.map((c) => {
        const Icon = c.icon;
        const isSelected = selectedId === c.id;
        const isConnected = connected.has(c.id);
        const brandColor = isConnected ? (BRAND_COLOR[c.id] ?? c.iconColor ?? 'text-foreground') : 'text-muted-foreground/60';
        return (
          <button key={c.id} type="button"
            onClick={() => isConnected ? onPick(c) : onPick(c)}
            aria-pressed={isSelected}
            className={cn(
              'group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border bg-background p-3 text-center transition active:scale-[0.98]',
              !isConnected && 'border-dashed border-border bg-muted/30',
              isConnected && !isSelected && 'border-border hover:border-primary/40 hover:shadow-md',
              isSelected && 'border-primary ring-2 ring-primary/30 shadow-md',
            )}>
            {isConnected && (
              <span aria-hidden className={cn(
                'absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full',
                isSelected ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-primary',
              )}>
                <Plus className="h-4 w-4" />
              </span>
            )}

            <span className="flex h-7 w-7 items-center justify-center">
              {c.brand
                ? <BrandIcon name={c.brand} className={cn('h-6 w-6', brandColor)} />
                : Icon ? <Icon className={cn('h-6 w-6', brandColor)} /> : null}
            </span>

            <span className={cn(
              'text-[13px] font-semibold leading-tight',
              isConnected ? 'text-foreground' : 'text-muted-foreground/70',
            )}>
              {c.label}
            </span>

            {c.free ? (
              <span className={cn('text-[11px] font-bold', isConnected ? 'text-primary' : 'text-muted-foreground/60')}>
                חינם
              </span>
            ) : (
              <span className={cn('text-[12px] font-bold', isConnected ? 'text-foreground' : 'text-muted-foreground/60')} dir="ltr">
                <bdi dir="ltr">₪{c.price}</bdi>
              </span>
            )}

            {isConnected && isSelected && (
              <span className="absolute inset-x-2 bottom-1.5 truncate text-[10px] font-semibold text-primary">
                {brandName}
              </span>
            )}

            {!isConnected && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Plug className="h-3 w-3" />
                חבר
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);



/* ───────────── Inline composer ───────────── */

const TAG_CHIPS = ['[שם_פרטי]', '[עיר]'];
const MAX_CHARS = 1000;

const InlineComposer = ({
  channel, brandName, onConfirm,
}: {
  channel: ChannelCard;
  brandName: string;
  onConfirm: (payload: { body: string; mode: 'now' | 'scheduled' }) => void;
}) => {
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [generating, setGenerating] = useState(false);

  // Attachment / media state
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; kind: 'image' | 'file' | 'audio'; url?: string }[]>([]);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Reset on channel change
  useEffect(() => { setBody(''); setMode('now'); setAttachments([]); }, [channel.id]);

  const handleFiles = (files: FileList | null, kind: 'image' | 'file') => {
    if (!files) return;
    const max = 25 * 1024 * 1024;
    const added: typeof attachments = [];
    Array.from(files).forEach((f) => {
      if (f.size > max) { toast.error(`${f.name}: גודל מעל 25MB`); return; }
      added.push({ name: f.name, kind, url: URL.createObjectURL(f) });
    });
    if (added.length) setAttachments((a) => [...a, ...added]);
  };

  const handleAIImage = async () => {
    const prompt = body.trim() || 'תמונת קמפיין נדל"ן עבור Realtyz AI';
    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { purpose: 'image', prompt, brand: brandName, language: 'he' },
      });
      if (error) throw error;
      const url = data?.url || data?.image_url;
      if (url) {
        setAttachments((a) => [...a, { name: 'AI Image', kind: 'image', url }]);
        toast.success('תמונה נוצרה');
      } else toast.info('לא התקבלה תמונה מה-AI');
    } catch { toast.error('יצירת תמונה נכשלה'); }
    finally { setGeneratingImage(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAttachments((a) => [...a, { name: `הקלטה ${new Date().toLocaleTimeString('he-IL')}.webm`, kind: 'audio', url }]);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch { toast.error('אין גישה למיקרופון'); }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };


  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) { setBody((b) => (b + ' ' + tag).slice(0, MAX_CHARS)); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + tag + body.slice(end)).slice(0, MAX_CHARS);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + tag.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          purpose: 'campaign',
          channel: channel.id,
          brand: brandName,
          tone: 'professional',
          language: 'he',
        },
      });
      if (error) throw error;
      const text = (data?.text || data?.content || '').toString().slice(0, MAX_CHARS);
      if (text) setBody(text);
      else toast.info('לא התקבל טקסט מה-AI');
    } catch (e: any) {
      toast.error('יצירת טקסט נכשלה');
    } finally {
      setGenerating(false);
    }
  };

  const hasBody = body.trim().length > 0;
  const count = body.length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm space-y-4" dir="rtl">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">תוכן ההודעה</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
            <Bot className="h-3.5 w-3.5" />
            {generating ? 'מחולל…' : 'חולל טקסט עם AI'}
          </button>
          <span className="text-[11px] tabular-nums text-muted-foreground" dir="ltr">
            {count}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        rows={6}
        value={body}
        maxLength={MAX_CHARS}
        onChange={(e) => setBody(e.target.value)}
        className="resize-y text-right"
      />

      {/* Hidden inputs */}
      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'image'); e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files, 'file'); e.target.value = ''; }} />

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <div key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1 text-xs">
              {att.kind === 'image' && att.url ? (
                <img src={att.url} alt={att.name} className="h-8 w-8 rounded object-cover" />
              ) : att.kind === 'audio' ? (
                <Mic className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[140px] truncate">{att.name}</span>
              <button type="button" onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Tag pills + action icons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button type="button" onClick={recording ? stopRecording : startRecording}
            className={cn(
              'rounded-lg border p-2 transition',
              recording
                ? 'border-destructive bg-destructive/10 text-destructive animate-pulse'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
            aria-label={recording ? 'עצור הקלטה' : 'הקלטה'}>
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground" aria-label="גלריה">
                <ImageIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1" dir="rtl">
              <button type="button" onClick={() => galleryInputRef.current?.click()}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>גלריה</span>
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => cameraInputRef.current?.click()}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
                <span>מצלמה</span>
                <Camera className="h-4 w-4 text-muted-foreground" />
              </button>
              <button type="button" onClick={handleAIImage} disabled={generatingImage}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60">
                <span>{generatingImage ? 'מחולל…' : 'תמונת AI'}</span>
                <Sparkles className="h-4 w-4 text-primary" />
              </button>
            </PopoverContent>
          </Popover>

          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground" aria-label="קובץ מצורף">
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {TAG_CHIPS.map((tag) => (
            <button key={tag} type="button" onClick={() => insertTag(tag)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary">
              {tag}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">תגיות:</span>
        </div>
      </div>


      {/* Dispatch mode selector — only when body has content */}
      {hasBody && (
        <div className="rounded-xl border border-border bg-background p-2 grid grid-cols-2 gap-2">
          {([
            { id: 'now',       label: 'שליחה מיידית' },
            { id: 'scheduled', label: 'תזמון עתידי' },
          ] as const).map((opt) => {
            const active = mode === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => setMode(opt.id)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-semibold transition',
                  active
                    ? 'border border-foreground/80 bg-background text-foreground shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground',
                )}>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Dispatch CTA */}
      <button type="button"
        onClick={() => hasBody && onConfirm({ body, mode })}
        disabled={!hasBody}
        className={cn(
          'w-full rounded-xl px-4 py-3 text-sm font-bold transition flex items-center justify-center gap-2',
          hasBody
            ? 'bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)] shadow-md'
            : 'bg-muted text-muted-foreground/80 cursor-not-allowed',
        )}>
        <Send className="h-4 w-4 -scale-x-100" />
        שגר פוסט ציבורי עכשיו
      </button>
    </div>
  );
};

/* ───────────── Dispatch confirmation modal ───────────── */

const ConfirmDispatchDialog = ({
  open, onClose, channel, body, brandName, onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelCard | null;
  body: string;
  brandName: string;
  onConfirmed: () => void;
}) => {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  if (!channel) return null;

  const profileLabel = `${brandName} · @${brandName.replace(/\s+/g, '')}`;
  const initials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'R';
  const summaryTitle = body.trim().slice(0, 24) || channel.label;

  const handleConfirm = async () => {
    if (!user) { toast.error('יש להתחבר'); return; }
    setSending(true);
    try {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, full_name, phone, email')
        .limit(100);
      if (error) throw error;
      const rows = (leads || []).map((l: any) => ({
        user_id: user.id,
        campaign_name: `${brandName} · ${channel.label}`,
        channel: channel.id,
        lead_id: l.id,
        recipient_phone: l.phone,
        recipient_email: l.email,
        recipient_name: l.full_name,
        message_body: body,
        status: 'queued' as const,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('campaign_logs').insert(rows);
        if (insErr) throw insErr;
      }
      toast.success(`שודר ל-${rows.length} מתעניינים בערוץ ${channel.label}`);
      onConfirmed();
      onClose();
    } catch (e: any) {
      toast.error('שידור נכשל: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">אישור דיוור וסיכום תקציב</DialogTitle>
          <DialogDescription className="text-center">
            קמפיין "{summaryTitle}" · ערוצים: {channel.label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-right text-sm font-semibold text-foreground">פרסום בעמוד / פרופיל</div>
          <div className="rounded-xl border border-border bg-background p-3 space-y-3">
            <button type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              <span className="truncate font-medium text-foreground">{profileLabel}</span>
            </button>
            <div className="flex items-center justify-end gap-3 px-1">
              <div className="text-right">
                <div className="text-sm font-bold text-foreground">{brandName}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">@{brandName.replace(/\s+/g, '')}</div>
              </div>
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-muted text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        <DialogFooter className="!justify-between gap-2 sm:gap-2 flex-row-reverse">
          <Button onClick={handleConfirm} disabled={sending}
            className="bg-[hsl(217,80%,18%)] text-white hover:bg-[hsl(217,80%,14%)]">
            {sending ? 'משדר…' : 'אישור ושידור'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={sending}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


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
        <div className="flex items-center justify-between gap-3" dir="rtl">
          <Label htmlFor="pos-hold" className="text-sm text-right flex-1">לתגובות חיוביות: המתנה לנציג</Label>
          <Switch checked={positiveHold} onCheckedChange={setPositiveHold} id="pos-hold" />
        </div>
        <div className="flex items-center justify-between gap-3" dir="rtl">
          <Label htmlFor="neg-hold" className="text-sm text-right flex-1">לתגובות שליליות: המתנה לנציג</Label>
          <Switch checked={negativeHold} onCheckedChange={setNegativeHold} id="neg-hold" />
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
          <article key={c.id} dir="rtl" className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-border" dir="rtl">
              <div className="flex items-center gap-2">
                {c.brand && <BrandIcon name={c.brand} className="h-5 w-5" />}
                <h3 className="font-semibold text-foreground">{c.label}</h3>
              </div>
              <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">0</span>
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
  const { settings } = useWhiteLabel();
  const brandName = settings?.agency_name || 'Realtyz AI';
  const [pickedChannel, setPickedChannel] = useState<ChannelCard | null>(null);
  const [confirmPayload, setConfirmPayload] = useState<{ body: string; mode: 'now' | 'scheduled' } | null>(null);


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
                className="flex-1 min-w-fit whitespace-nowrap px-3 py-2 text-base sm:text-lg font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="create" className="mt-6 space-y-4">
          <ChannelGrid selectedId={pickedChannel?.id ?? null} onPick={setPickedChannel} brandName={brandName} />
          {pickedChannel && (
            <InlineComposer
              channel={pickedChannel}
              brandName={brandName}
              onConfirm={(p) => setConfirmPayload(p)}
            />
          )}
        </TabsContent>
        <TabsContent value="published" className="mt-6">
          <PublishedFeed />
        </TabsContent>
        <TabsContent value="responses" className="mt-6">
          <ResponsesView />
        </TabsContent>
      </Tabs>

      <ConfirmDispatchDialog
        open={!!confirmPayload}
        onClose={() => setConfirmPayload(null)}
        channel={pickedChannel}
        body={confirmPayload?.body ?? ''}
        brandName={brandName}
        onConfirmed={() => { setConfirmPayload(null); setPickedChannel(null); }}
      />
    </div>
  );
};


export default CampaignCenter;
