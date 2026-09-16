import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BellRing, CalendarCheck2, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';

export type TaskLeadLite = {
  profile_picture_url?: string | null;
  id: string;
  full_name: string | null;
  phone_number: string | null;
  city?: string | null;
};

export type TaskFormValues = {
  lead: TaskLeadLite | null;
  when: string;
  priority: string;
  text: string;
};

export function localDefaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return toLocalDateTime(d.toISOString());
}

export function toLocalDateTime(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The ONE task form used both for "משימה חדשה" and for "עריכת משימה", so the
 * two dialogs are field-for-field identical: contact picker, due date with the
 * Google Calendar availability check, urgency and the task text.
 */
export default function TaskFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  submitLabel: string;
  initial?: Partial<TaskFormValues>;
  onSubmit: (values: TaskFormValues) => Promise<void>;
}) {
  const [lead, setLead] = useState<TaskLeadLite | null>(null);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<TaskLeadLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [when, setWhen] = useState(localDefaultDue());
  const [priority, setPriority] = useState('medium');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [calendarSlots, setCalendarSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setLead(initial?.lead ?? null);
    setWhen(initial?.when || localDefaultDue());
    setPriority(initial?.priority || 'medium');
    setText(initial?.text ?? '');
    setLeadQuery('');
    setLeadResults([]);
    setCalendarSlots([]);
    setCalendarConnected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.lead?.id, initial?.when, initial?.priority, initial?.text]);

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

  const loadCalendarSlots = async () => {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-availability', {
        body: { lead_id: lead?.id ?? null, duration_minutes: 30, create_booking_token: false },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'calendar_unavailable');
      const slots = Array.isArray(data.slots) ? data.slots : [];
      setCalendarSlots(slots);
      setCalendarConnected(true);
      if (slots[0]?.start) setWhen(toLocalDateTime(slots[0].start));
    } catch {
      setCalendarSlots([]);
      setCalendarConnected(false);
    } finally {
      setCalendarLoading(false);
    }
  };

  const submit = async () => {
    if (!text.trim()) { toast.error('כתוב את המשימה'); return; }
    if (!when) { toast.error('בחר מועד'); return; }
    setSaving(true);
    try {
      await onSubmit({ lead, when, priority, text: text.trim() });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירת המשימה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-right sm:max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <BellRing className="h-5 w-5 text-primary" />
            {title}
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

          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">מועד</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={loadCalendarSlots}
              disabled={calendarLoading}
              aria-label="בדיקת זמינות ביומן Google"
              title="בדיקת זמינות ביומן Google"
            >
              {calendarLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />}
            </Button>
            <div className="min-w-[110px] space-y-2">
              <Label className="text-sm font-semibold">דחיפות</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">גבוהה</SelectItem>
                  <SelectItem value="medium">בינונית</SelectItem>
                  <SelectItem value="low">נמוכה</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {calendarConnected === false && (
            <p className="text-sm text-muted-foreground">היומן אינו מחובר. ניתן לבחור מועד ידנית.</p>
          )}
          {calendarSlots.length > 0 && (
            <div className="grid grid-cols-1 gap-2">
              {calendarSlots.map((slot) => {
                const value = toLocalDateTime(slot.start);
                const selected = when === value;
                return (
                  <Button
                    key={slot.start}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => setWhen(value)}
                    className="justify-between"
                  >
                    <span>{new Date(slot.start).toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                    <span>{new Date(slot.start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={selected ? 'text-primary-foreground' : 'text-success'}>פנוי</span>
                  </Button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">משימה / תזכורת</Label>
              <VoiceInputButton size="sm" language="auto" onTranscript={(value) => setText((current) => current ? `${current} ${value}` : value)} />
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="resize-none" />
          </div>

          <Button className="w-full font-bold" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <BellRing className="me-2 h-4 w-4" />}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
