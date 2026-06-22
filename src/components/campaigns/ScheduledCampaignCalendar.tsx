import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Pencil, Plus, Calendar as CalendarIcon, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type ScheduledRow = {
  id: string;
  campaign_name: string;
  channel: string;
  message_body: string | null;
  created_at: string;
  sent_at: string | null;
  status: string | null;
  provider_message_id: string | null;
  provider_response: any;
};

const CHANNEL_COLORS: Record<string, string> = {
  facebook:  'bg-blue-100 text-blue-800 ring-blue-200',
  instagram: 'bg-pink-100 text-pink-800 ring-pink-200',
  x:         'bg-slate-200 text-slate-900 ring-slate-300',
  twitter:   'bg-slate-200 text-slate-900 ring-slate-300',
  tiktok:    'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200',
  linkedin:  'bg-sky-100 text-sky-800 ring-sky-200',
  youtube:   'bg-red-100 text-red-800 ring-red-200',
  email:     'bg-emerald-100 text-emerald-800 ring-emerald-200',
};

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ScheduledCampaignCalendar({ onCreateAt, onClose }: { onCreateAt: (iso: string) => void; onClose?: () => void }) {
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editing, setEditing] = useState<ScheduledRow | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editWhen, setEditWhen] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_logs')
      .select('id, campaign_name, channel, message_body, created_at, sent_at, status, provider_message_id, provider_response')
      .eq('is_archived', false)
      .eq('status', 'scheduled')
      .gt('sent_at', new Date().toISOString())
      .order('sent_at', { ascending: true })
      .limit(500);
    if (error) {
      toast.error('טעינת מתוזמנים נכשלה: ' + error.message);
      setRows([]);
    } else {
      // De-duplicate identical campaigns (same name+channel+sent_at) so a
      // single scheduled post that fanned out to multiple leads renders as
      // one card on the calendar.
      const seen = new Map<string, ScheduledRow>();
      for (const r of (data || []) as ScheduledRow[]) {
        const key = `${r.campaign_name}|${r.channel}|${r.sent_at}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      setRows(Array.from(seen.values()));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(cursor);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - startWeekday);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const rowsByDay = useMemo(() => {
    const map = new Map<string, ScheduledRow[]>();
    for (const r of rows) {
      if (!r.sent_at) continue;
      const d = new Date(r.sent_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  const openEditor = (r: ScheduledRow) => {
    setEditing(r);
    setEditBody(r.message_body || '');
    setEditWhen(r.sent_at ? toLocalInput(new Date(r.sent_at)) : '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    const when = editWhen ? new Date(editWhen) : null;
    if (!when || Number.isNaN(when.getTime())) {
      toast.error('בחר תאריך ושעה תקפים');
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      toast.error('הזמן חייב להיות לפחות 30 שניות קדימה');
      return;
    }
    setSaving(true);
    // Update all rows in the same scheduled batch (same campaign_name +
    // channel + original sent_at) so a fan-out broadcast moves as one unit.
    const { error } = await supabase
      .from('campaign_logs')
      .update({ sent_at: when.toISOString(), message_body: editBody })
      .eq('campaign_name', editing.campaign_name)
      .eq('channel', editing.channel)
      .eq('sent_at', editing.sent_at!);
    setSaving(false);
    if (error) { toast.error('עדכון נכשל: ' + error.message); return; }
    toast.success('הקמפיין עודכן · שים לב שעדכון אצל ספק הפרסום עשוי לדרוש פרסום מחדש');
    setEditing(null);
    load();
  };

  const cancelScheduled = async (r: ScheduledRow) => {
    if (!confirm('לבטל את הפרסום המתוזמן הזה?')) return;
    // Try to cancel on Ayrshare for posts that already received an external id.
    const externalIds = Array.from(new Set([
      r.provider_message_id,
      ...((r.provider_response as any)?.postIds || [])
        .map((p: any) => p?.id ?? p?.postId)
        .filter(Boolean),
    ].filter(Boolean) as string[]));
    if (externalIds.length > 0) {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ayrshare-post`;
      for (const pid of externalIds) {
        try {
          await fetch(fnUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken ?? ''}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ external_post_id: pid }),
          });
        } catch { /* fall through to local delete */ }
      }
    }
    const { error } = await supabase
      .from('campaign_logs')
      .delete()
      .eq('campaign_name', r.campaign_name)
      .eq('channel', r.channel)
      .eq('sent_at', r.sent_at!);
    if (error) { toast.error('ביטול נכשל: ' + error.message); return; }
    toast.success('הפרסום המתוזמן בוטל');
    load();
  };

  const monthLabel = `${HEBREW_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const today = new Date();

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="חזור"
              title="חזור"
              className="h-9 w-9"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}
          <h2 className="text-lg font-bold text-foreground">לוח שנה — פרסומים מתוזמנים</h2>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="סגור לוח שנה"
              title="סגור לוח שנה"
              className="h-9 w-9"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() - 1);
              setCursor(d);
            }}
            aria-label="חודש קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-bold text-foreground tabular-nums">{monthLabel}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() + 1);
              setCursor(d);
            }}
            aria-label="חודש הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setCursor(d);
            }}
          >
            היום
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {loading ? 'טוען…' : `${rows.length} פרסומים מתוזמנים`}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {HEBREW_WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day, idx) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = sameDay(day, today);
            const isPast = day.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const dayRows = rowsByDay.get(key) || [];
            return (
              <div
                key={idx}
                className={cn(
                  'group relative min-h-[110px] border-b border-l border-border p-1.5 flex flex-col gap-1',
                  !inMonth && 'bg-muted/20 text-muted-foreground',
                  isToday && 'bg-amber-50/50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs font-bold tabular-nums',
                    isToday ? 'text-amber-700' : 'text-foreground',
                  )}>
                    {day.getDate()}
                  </span>
                  {!isPast && (
                    <button
                      type="button"
                      onClick={() => {
                        const slot = new Date(day);
                        slot.setHours(10, 0, 0, 0);
                        if (slot.getTime() <= Date.now() + 60_000) {
                          slot.setTime(Date.now() + 30 * 60_000);
                        }
                        onCreateAt(slot.toISOString());
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-slate-900 text-white p-0.5"
                      aria-label="הוסף פרסום מתוזמן"
                      title="הוסף פרסום מתוזמן"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayRows.slice(0, 3).map((r) => {
                    const t = new Date(r.sent_at!);
                    const channel = String(r.channel || '').toLowerCase();
                    const cls = CHANNEL_COLORS[channel] || 'bg-slate-100 text-slate-800 ring-slate-200';
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openEditor(r)}
                        className={cn(
                          'truncate text-right text-[11px] font-semibold rounded-md px-1.5 py-0.5 ring-1 hover:opacity-80 transition-opacity',
                          cls,
                        )}
                        title={`${r.campaign_name} · ${t.toLocaleString('he-IL')}`}
                      >
                        <span className="tabular-nums">{t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="mx-1">·</span>
                        <span className="truncate">{(r.message_body || r.campaign_name).split('\n')[0]}</span>
                      </button>
                    );
                  })}
                  {dayRows.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{dayRows.length - 3} נוספים</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 justify-end">
              <CalendarIcon className="h-4 w-4" />
              עריכת פרסום מתוזמן
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">מועד פרסום</label>
              <Input
                type="datetime-local"
                value={editWhen}
                onChange={(e) => setEditWhen(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">תוכן הפוסט</label>
              <Textarea
                rows={6}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="text-right"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              עדכון מועד או תוכן ישנה את הרשומה במערכת. אם הפוסט כבר נשלח לתור של ספק הפרסום, ייתכן שיידרש לבטל ולפרסם מחדש.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => { if (editing) { const e = editing; setEditing(null); cancelScheduled(e); } }}
            >
              <Trash2 className="ml-1 h-4 w-4" />
              בטל פרסום
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>סגור</Button>
            <Button onClick={saveEdit} disabled={saving}>
              <Pencil className="ml-1 h-4 w-4" />
              {saving ? 'שומר…' : 'שמור שינויים'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
