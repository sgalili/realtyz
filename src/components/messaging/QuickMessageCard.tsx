import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Send, Copy, ExternalLink, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { openOfficialWhatsApp, sendViaOfficialWaba } from '@/lib/officialWa';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuickTemplates, fillTemplate, type TemplateVars } from '@/hooks/useQuickTemplates';

type Props = {
  scope: 'lead' | 'listing';
  leadId?: string | null;
  phone?: string | null;
  vars: TemplateVars;
  listingId?: string | null;
  className?: string;
  collapsible?: boolean;
  forceOpenKey?: number;
};

function toIntl(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

export default function QuickMessageCard({ scope, leadId, phone, vars, listingId, className, collapsible = false, forceOpenKey = 0 }: Props) {
  const { data: templates = [], isLoading } = useQuickTemplates(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (collapsible && forceOpenKey > 0) setOpen(true);
  }, [collapsible, forceOpenKey]);

  const intl = useMemo(() => toIntl(phone), [phone]);
  const scopeKey = leadId ? `lead:${leadId}` : listingId ? `listing:${listingId}` : null;

  const pick = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSelectedId(id);
    setText(fillTemplate(tpl.body, vars));
    if (tpl.channel === 'sms') setChannel('sms');
    else if (tpl.channel === 'whatsapp') setChannel('whatsapp');
  };

  const logInteraction = async (content: string, platform: string, status: 'sent' | 'manual') => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || !scopeKey) return;
    await supabase.from('interaction_activity_log').insert({
      user_id: auth.user.id,
      thread_key: scopeKey,
      platform,
      action_type: 'interaction',
      actor_type: 'human',
      actor_label: 'תבנית מהירה',
      content,
      metadata: {
        ...(leadId ? { lead_id: leadId } : {}),
        ...(listingId ? { listing_id: listingId } : {}),
        template_id: selectedId,
        delivery: status,
      },
    });
    if (scopeKey) queryClient.invalidateQueries({ queryKey: ['smart-timeline', scopeKey] });
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body) return;
    if (!leadId || !intl) {
      toast.error('אין מספר טלפון לשליחה. אפשר להעתיק את הטקסט או לפתוח WhatsApp');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: { lead_id: leadId, content: body, channel, phone_number: intl },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string; details?: string } | null;
      if (res && res.success === false) throw new Error(res.details || res.error || 'השליחה נכשלה');
      await logInteraction(body, channel, 'sent');
      toast.success(channel === 'sms' ? 'ה-SMS נשלח ונרשם בציר הזמן' : 'ההודעה נשלחה ונרשמה בציר הזמן');
      setText('');
      setSelectedId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השליחה נכשלה');
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text.trim());
    await logInteraction(text.trim(), channel, 'manual');
    toast.success('הטקסט הועתק ונרשם בציר הזמן');
  };

  const handleOpenWa = async () => {
    if (!text.trim()) return;
    // Official Meta WBA gateway only — never a personal / Green API number.
    if (intl) {
      const res = await sendViaOfficialWaba({ lead_id: leadId ?? undefined, phone_number: intl, message: text.trim() });
      if (!res.ok) { toast.error(res.error || 'שליחה בוואטסאפ הרשמי נכשלה'); return; }
      toast.success('נשלח מהמספר הרשמי');
    } else {
      await openOfficialWhatsApp(text.trim());
    }
    await logInteraction(text.trim(), 'whatsapp', 'manual');
  };

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${open ? 'space-y-3' : ''} ${className || ''}`} dir="rtl">
      {collapsible && (
        <button
          type="button"
          className="flex w-full items-center gap-2 text-start"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <MessageSquareText className="h-4 w-4 text-primary" />
          <ChevronDown className={`ms-auto h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && <>

      <div className="flex flex-wrap gap-2">
        {isLoading && <span className="text-xs text-muted-foreground">טוען תבניות...</span>}
        {!isLoading && templates.length === 0 && (
          <span className="text-xs text-muted-foreground">אין תבניות. ניתן להוסיף בהגדרות ← אוטומציית תגובה מהירה</span>
        )}
        {templates.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={selectedId === t.id ? 'default' : 'outline'}
            className="text-[12px] h-8"
            onClick={() => pick(t.id)}
          >
            {t.title}
          </Button>
        ))}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="בחר תבנית או כתוב הודעה..."
        className="min-h-[90px] text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={channel} onValueChange={(v) => setChannel(v as 'whatsapp' | 'sms')}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={handleSend} disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          <span className="ms-1">שלח ורשום</span>
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={handleOpenWa} disabled={!text.trim()}>
          <ExternalLink className="h-3.5 w-3.5" /><span className="ms-1">פתח WhatsApp</span>
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={handleCopy} disabled={!text.trim()}>
          <Copy className="h-3.5 w-3.5" /><span className="ms-1">העתק</span>
        </Button>
      </div>
      </>}
    </div>
  );
}
