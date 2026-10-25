import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { quietWeekFromPreferences, quietWeekValid, type QuietWeek } from '../../supabase/functions/_shared/notificationPreferences';
import type { NotificationPreferences } from '@/hooks/useNotificationPreferences';

const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export default function WeeklyQuietHours({ value, onChange }: { value: NotificationPreferences; onChange: (week: QuietWeek) => void }) {
  const week = quietWeekFromPreferences(value);
  const [start, setStart] = useState(value.quiet_hours_start?.slice(0, 5) ?? '22:00');
  const [end, setEnd] = useState(value.quiet_hours_end?.slice(0, 5) ?? '07:00');
  return <section className="space-y-3">
    <h3 className="text-sm font-semibold">שעות שקטות (UTC)</h3>
    <div className="grid grid-cols-2 gap-3">
      <Label className="space-y-1 text-xs">התחלה לכל הימים<Input type="time" aria-label="התחלה לכל הימים" value={start} onChange={event => setStart(event.target.value)} /></Label>
      <Label className="space-y-1 text-xs">סיום לכל הימים<Input type="time" aria-label="סיום לכל הימים" value={end} onChange={event => setEnd(event.target.value)} /></Label>
    </div>
    <Button type="button" variant="outline" size="sm" className="w-full" disabled={!quietWeekValid({ all: { enabled: true, start, end } })} onClick={() => onChange(Object.fromEntries(days.map((_, index) => [String(index), { enabled: true, start, end }])))}>החלה על כל הימים</Button>
    <div className="space-y-2">{days.map((label, index) => {
      const key = String(index), day = week[key];
      return <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border pb-2">
        <Label className="flex items-center gap-2 text-xs"><Switch aria-label={`שעות שקטות · ${label}`} checked={day.enabled} onCheckedChange={enabled => onChange({ ...week, [key]: { ...day, enabled, start: day.start || start, end: day.end || end } })} /><span>{label}</span></Label>
        <Input className="min-w-0 px-1 text-sm" type="time" aria-label={`${label} · התחלה`} disabled={!day.enabled} value={day.start} onChange={event => onChange({ ...week, [key]: { ...day, start: event.target.value } })} />
        <Input className="min-w-0 px-1 text-sm" type="time" aria-label={`${label} · סיום`} disabled={!day.enabled} value={day.end} onChange={event => onChange({ ...week, [key]: { ...day, end: event.target.value } })} />
      </div>;
    })}</div>
    {!quietWeekValid(week) && <p role="alert" className="text-xs text-destructive">יש לבחור שעת התחלה וסיום שונות לכל יום פעיל.</p>}
  </section>;
}