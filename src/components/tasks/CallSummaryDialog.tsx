import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageSquarePlus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import type { TaskLeadLite } from '@/components/tasks/TaskFormDialog';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';

export const CALL_CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'whatsapp', label: 'וואטסאפ' },
  { value: 'phone', label: 'שיחת טלפון' },
  { value: 'email', label: 'אימייל' },
  { value: 'meeting', label: 'פגישה' },
  { value: 'facebook', label: 'פייסבוק' },
];

/**
 * Editing a call summary card (סיכום שיחה) opens THIS dialog — contact,
 * channel and the summary notes — never the task form.
 */
export default function CallSummaryDialog({
  logId,
  initialLead,
  initialText,
  onClose,
  onSaved,
}: {
  logId: string | null;
  initialLead: TaskLeadLite | null;
  initialText: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!logId;
  const [lead, setLead] = useState<TaskLeadLite | null>(initialLead);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<TaskLeadLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [channel, setChannel] = useState('whatsapp');
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  // Load the stored channel for this summary so the form opens fully populated.
  useEffect(() => {
    if (!open || !logId) return;
    setLead(initialLead);
    setText(initialText);
    setLeadQuery('');
    setLeadResults([]);
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('interaction_activity_log')
        .select('platform')
        .eq('id', logId)
        .maybeSingle();
      if (cancelled) return;
      setChannel(String(data?.platform || 'whatsapp'));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, logId, initialLead?.id, initialText]);

  useEffect(() => {
    if (!open) return;
    const q = leadQuery.trim();
    if (q.length < 2) { setLeadResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const digits = q.replace(/\D/g, '');
      const filters = [`full_name.ilike.%${q}%`];
      if (digits.length >= 3) filters.push(`phone_number.ilike.%${digits}%`);
      const { data } = await (supabase as any)
        .from('leads')
        .select('id, full_name, phone_number, city, profile_picture_url')
        .or(filters.join(','))
        .limit(8);
      if (cancelled) return;
      setLeadResults(Array.isArray(data) ? data : []);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setSearching(false); };
  }, [leadQuery, open]);

  const submit = async () => {
    if (!logId) return;
    if (!text.trim()) { toast.error('כתוב סיכום שיחה'); return; }
    setSaving(true);
    try {
      const { data: current } = await (supabase as any)
        .from('interaction_activity_log')
        .select('metadata')
        .eq('id', logId)
        .maybeSingle();
      const metadata = { ...((current?.metadata ?? {}) as Record<string, unknown>) };
      metadata.lead_id = lead?.id ?? null;
      const { error } = await (supabase as any)
        .from('interaction_activity_log')
        .update({ content: text.trim(), platform: channel, metadata })
        .eq('id', logId);
      if (error) throw error;
      toast.success('סיכום השיחה עודכן');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'עדכון סיכום השיחה נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-right sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            עריכת סיכום שיחה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">איש קשר</Label>
            {lead ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ContactAvatar
                    name={lead.full_name}
                    imageUrl={lead.profile_picture_url}
                    className="h-9 w-9 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{lead.full_name || 'ללא שם'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.phone_number ? formatPhoneDisplay(lead.phone_number) : '—'}
                      {lead.city ? ` · ${lead.city}` : ''}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setLead(null); setLeadQuery(''); }}>
                  החלף
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    style={{ insetInlineStart: '0.75rem' }}
                  />
                  <Input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="חיפוש לפי שם או טלפון"
                    className="ps-9"
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">מחפש…</p>}
                {leadResults.length > 0 && (
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                    {leadResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setLead(r); setLeadResults([]); }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right transition hover:bg-accent"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ContactAvatar name={r.full_name} imageUrl={r.profile_picture_url} className="h-7 w-7 shrink-0" />
                          <span className="truncate text-sm font-semibold">{r.full_name || 'ללא שם'}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {r.phone_number ? formatPhoneDisplay(r.phone_number) : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">ערוץ</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALL_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">סיכום שיחה</Label>
              <VoiceInputButton size="sm" language="auto" onTranscript={(value) => setText((current) => current ? `${current} ${value}` : value)} />
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="resize-none" />
          </div>

          <Button className="w-full font-bold" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="me-2 h-4 w-4" />}
            שמור סיכום שיחה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
