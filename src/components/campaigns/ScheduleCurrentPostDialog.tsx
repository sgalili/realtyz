// Dialog: schedule the CURRENT composer content (post body + first comment +
// attached media) at a chosen day/time-window, with optional recurrence.
// Mirrors the UI/UX of the calendar's "New scheduled campaign" dialog.
//
// Unlike the calendar-side flow, this does NOT create a new draft — it directly
// dispatches the composer payload to `ayrshare-post` for each computed slot
// with a `scheduled_at` timestamp.

import { useEffect, useMemo, useState } from 'react';
import { Repeat, Users, ChevronLeft, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { cn } from '@/lib/utils';

type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export type ScheduleTarget = {
  id: string;
  name: string;
  accountRef?: string | null;
  profileKey?: string | null;
};

export function ScheduleCurrentPostDialog({
  open,
  onClose,
  onScheduled,
  channelId,
  channelLabel,
  brandName,
  body,
  firstComment,
  mediaUrls,
  listingId,
  defaultGroupIds,
  targets,
  isSocialChannel,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  channelId: string;
  channelLabel: string;
  brandName: string;
  body: string;
  firstComment: string;
  mediaUrls: string[];
  listingId: string | null;
  defaultGroupIds: string[];
  targets: ScheduleTarget[];
  isSocialChannel: boolean;
}) {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  const [day, setDay] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [winStart, setWinStart] = useState('09:00');
  const [winEnd, setWinEnd] = useState('21:00');
  const [winCount, setWinCount] = useState(1);
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(defaultGroupIds || []);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedGroupIds(defaultGroupIds || []);
      setSubmitting(false);
    }
  }, [open, defaultGroupIds]);

  const dayLabel = useMemo(() => {
    try {
      return new Date(day + 'T00:00:00').toLocaleDateString('he-IL');
    } catch {
      return day;
    }
  }, [day]);

  const buildSlots = (): Date[] => {
    const base = new Date(day + 'T00:00:00');
    const [sh, sm] = winStart.split(':').map(Number);
    const [eh, em] = winEnd.split(':').map(Number);
    const startMin = (sh || 0) * 60 + (sm || 0);
    const endMin = (eh || 0) * 60 + (em || 0);
    if (endMin <= startMin) {
      toast.error('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return [];
    }
    const n = Math.max(1, winCount);
    const span = endMin - startMin;
    const bucket = span / n;

    const buildDaySlots = (dayBase: Date): Date[] => {
      const out: Date[] = [];
      for (let i = 0; i < n; i++) {
        const offset = startMin + i * bucket + (n > 1 ? Math.random() * bucket : 0);
        const total = Math.floor(offset);
        const d = new Date(dayBase);
        d.setHours(Math.floor(total / 60), total % 60, Math.floor(Math.random() * 60), 0);
        if (d.getTime() <= Date.now() + 60_000) {
          d.setTime(Date.now() + (i + 1) * 5 * 60_000);
        }
        out.push(d);
      }
      return out;
    };

    const recDates: Date[] = [];
    if (recurrence === 'none') {
      recDates.push(new Date(base));
    } else if (recurrence === 'daily') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        recDates.push(d);
      }
    } else if (recurrence === 'weekly') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i * 7);
        recDates.push(d);
      }
    } else if (recurrence === 'monthly') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setMonth(d.getMonth() + i);
        recDates.push(d);
      }
    } else if (recurrence === 'custom') {
      if (recurrenceDays.length === 0) {
        toast.error('בחר לפחות יום אחד בשבוע');
        return [];
      }
      const weeks = Math.max(1, recurrenceCount);
      for (let w = 0; w < weeks; w++) {
        for (let dow = 0; dow < 7; dow++) {
          if (!recurrenceDays.includes(dow)) continue;
          const b = new Date(base);
          b.setDate(b.getDate() - b.getDay() + dow + w * 7);
          if (b.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) continue;
          recDates.push(b);
        }
      }
    }

    return recDates.flatMap((d) => buildDaySlots(d)).sort((a, b) => a.getTime() - b.getTime());
  };

  const handleSubmit = async () => {
    if (!user) { toast.error('יש להתחבר'); return; }
    if (!body.trim()) { toast.error('אין תוכן לתזמון'); return; }
    const slots = buildSlots();
    if (slots.length === 0) return;

    setSubmitting(true);
    const ownerScope = workspaceOwnerId ?? user.id;
    const campaignName = `${brandName} · ${channelLabel}`;
    const fanoutTargets =
      isSocialChannel && channelId === 'facebook' && targets.length > 0
        ? targets
        : [null as ScheduleTarget | null];

    let ok = 0;
    let failed = 0;
    try {
      for (const slot of slots) {
        for (const target of fanoutTargets) {
          const { data, error } = await supabase.functions.invoke('ayrshare-post', {
            body: {
              post: body,
              channels: [channelId],
              campaign_name: target ? `${campaignName} · ${target.name}` : campaignName,
              media_urls: mediaUrls,
              scheduled_at: slot.toISOString(),
              workspace_owner_id: ownerScope,
              group_ids: channelId === 'facebook' ? selectedGroupIds : [],
              target_profile_id: target?.id ?? null,
              target_account_ref: target?.accountRef ?? null,
              target_profile_key: target?.profileKey ?? null,
              first_comment: firstComment || null,
              listing_id: listingId,
            },
          });
          const payload: any = data;
          if (error || payload?.error || payload?.success === false) {
            failed++;
          } else {
            ok++;
          }
        }
      }
      if (ok > 0) {
        toast.success(`תוזמנו ${ok} פרסומים${failed ? ` (${failed} נכשלו)` : ''}`);
        onScheduled();
        onClose();
      } else {
        toast.error('תזמון נכשל');
      }
    } catch (e: any) {
      toast.error(e?.message || 'תזמון נכשל');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-end">
            תזמון פרסומים ליום {dayLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">תאריך</label>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              dir="rtl"
              className="text-right"
            />
          </div>
          <div className="flex items-end gap-2 flex-row-reverse">
            <Popover open={recurrenceOpen} onOpenChange={setRecurrenceOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="חזרתיות"
                  aria-label="חזרתיות"
                  className={cn(
                    'relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors',
                    recurrence !== 'none' && 'text-primary',
                  )}
                >
                  <Repeat className="h-5 w-5" />
                  {recurrence !== 'none' && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-64 p-2" dir="rtl">
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1">חזרתיות</div>
                <div className="flex flex-col">
                  {([
                    ['none', 'ללא חזרה'],
                    ['daily', 'בכל יום'],
                    ['weekly', 'בכל שבוע'],
                    ['monthly', 'בכל חודש'],
                    ['custom', 'ימים ושעות נבחרים'],
                  ] as Array<[Recurrence, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRecurrence(key)}
                      className={cn(
                        'text-right text-sm rounded-md px-2 py-1.5 hover:bg-muted/60',
                        recurrence === key && 'bg-primary/10 text-primary font-semibold',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {recurrence === 'custom' && (
                  <div className="mt-2 border-t pt-2">
                    <div className="text-[11px] text-muted-foreground mb-1 text-right">בחר ימי שבוע</div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {HEBREW_WEEKDAYS.map((d, i) => {
                        const active = recurrenceDays.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setRecurrenceDays((prev) =>
                                prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                              )
                            }
                            className={cn(
                              'h-7 w-7 text-[11px] rounded-full border',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-muted/60',
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {recurrence !== 'none' && (
                  <div className="mt-2 border-t pt-2">
                    <label className="text-[11px] text-muted-foreground block mb-1 text-right">
                      {recurrence === 'weekly' || recurrence === 'custom'
                        ? 'מספר שבועות'
                        : recurrence === 'monthly' ? 'מספר חודשים' : 'מספר ימים'}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                      className="h-8 text-right"
                    />
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">עד שעה</label>
              <Input
                type="time"
                value={winEnd}
                onChange={(e) => setWinEnd(e.target.value)}
                dir="rtl"
                className="text-left"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">משעה</label>
              <Input
                type="time"
                value={winStart}
                onChange={(e) => setWinStart(e.target.value)}
                dir="rtl"
                className="text-left"
              />
            </div>
          </div>
          <div className="flex items-end gap-2 flex-row-reverse">
            <div className="w-28">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">כמות פוסטים</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={winCount}
                onChange={(e) => setWinCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="text-right"
              />
            </div>
            <div className="flex-1 h-9 flex items-center justify-end rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
              מפרסם את התוכן הנוכחי
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2 w-full items-center">
          <Button variant="outline" onClick={onClose} disabled={submitting}>ביטול</Button>
          {channelId === 'facebook' && (
            <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="בחר קבוצות פייסבוק לפרסום"
                  aria-label="קבוצות פייסבוק"
                  className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors"
                >
                  <Users className="h-5 w-5" />
                  {selectedGroupIds.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {selectedGroupIds.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-[360px] p-0" dir="rtl">
                <CampaignGroupSelector
                  selectedIds={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  className="border-0 shadow-none"
                />
              </PopoverContent>
            </Popover>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            {submitting ? 'מתזמן…' : 'תזמן פרסום'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleCurrentPostDialog;
