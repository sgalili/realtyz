import { useEffect, useState } from 'react';
import { Bell, Flame, CalendarCheck, AlertTriangle, Loader2, MessageCircle, Mail, Smartphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import WeeklyQuietHours from '@/components/WeeklyQuietHours';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNotificationPreferences, defaultNotificationPreferences, panelCategoryEnabled, type NotificationPreferences, type PanelCategory } from '@/hooks/useNotificationPreferences';
import { channelsForEvent, eventPreferenceKeys, quietWeekFromPreferences, quietWeekValid, type NotificationEvent, type NotificationChannel } from '../../supabase/functions/_shared/notificationPreferences';
const events: { key: NotificationEvent; label: string; Icon: typeof Bell }[] = [
  { key: 'new_high_priority', label: 'ליד בעדיפות גבוהה', Icon: Flame },
  { key: 'meeting_booked', label: 'פגישה או ליד שהבשיל', Icon: CalendarCheck },
  { key: 'critical_question', label: 'שאלה הדורשת התערבות', Icon: AlertTriangle },
];
const categories: { key: PanelCategory; label: string }[] = [
  { key: 'new_lead', label: 'לידים חדשים' }, { key: 'inbound', label: 'הודעות נכנסות' },
  { key: 'rita_sms_reply', label: 'תשובות ריטה ב־SMS' }, { key: 'tour', label: 'סיורים' },
  { key: 'critical', label: 'התראות שיחה' }, { key: 'budget', label: 'תקציב' },
];
const channels: { key: NotificationChannel; label: string; Icon: typeof Bell }[] = [
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle }, { key: 'sms', label: 'SMS', Icon: Smartphone }, { key: 'email', label: 'Email', Icon: Mail },
];
export default function NotificationPreferencesPanel({ compact = false, onSaved }: { compact?: boolean; onSaved?: () => void }) {
  const preferences = useNotificationPreferences();
  const [local, setLocal] = useState<NotificationPreferences>(defaultNotificationPreferences);
  useEffect(() => { if (preferences.data) setLocal(preferences.data); }, [preferences.data]);
  if (preferences.isLoading) return <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />טוען העדפות…</p>;
  if (preferences.isError) return <div role="alert"><p>לא ניתן לטעון את ההעדפות.</p><Button variant="outline" onClick={() => void preferences.refetch()}>ניסיון נוסף</Button></div>;
  return <div className="space-y-5" dir="rtl">
    {!compact && <h2 className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" />העדפות התראות</h2>}
    <section className="space-y-1"><h3 className="text-sm font-semibold">הודעות אליי</h3>
      {events.map(({ key, label, Icon }) => {
        const selected = channelsForEvent(local, key);
        const enabled = local[eventPreferenceKeys[key]];
        return <div key={key} className="space-y-2 border-b border-border py-3">
          <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="flex-1 text-sm font-medium">{label}</span><Switch aria-label={label} checked={enabled} onCheckedChange={value => setLocal(previous => ({ ...previous, [eventPreferenceKeys[key]]: value }))} /></div>
          {enabled && <div className="flex flex-wrap gap-2">{channels.map(({ key: channel, label: channelLabel, Icon: ChannelIcon }) => <Button key={channel} type="button" variant={selected.includes(channel) ? 'default' : 'outline'} size="sm" aria-pressed={selected.includes(channel)} aria-label={`${label} · ${channelLabel}`} className="h-8 gap-1.5" onClick={() => {
            const next = selected.includes(channel) ? selected.filter(value => value !== channel) : [...selected, channel];
            setLocal(previous => ({ ...previous, event_channels: { ...(previous.event_channels as Record<string, import('@/integrations/supabase/types').Json>), [key]: next } }));
          }}><ChannelIcon className="h-3.5 w-3.5" />{channelLabel}</Button>)}</div>}
        </div>;
      })}
    </section>
    <section><h3 className="mb-2 text-sm font-semibold">בחלון ההתראות</h3><div className="grid grid-cols-2 gap-x-4 gap-y-3">{categories.map(({ key, label }) => <Label key={key} className="flex items-center justify-between gap-2 text-xs"><span>{label}</span><Switch aria-label={`בחלון · ${label}`} checked={panelCategoryEnabled(local, key)} onCheckedChange={value => setLocal(previous => ({ ...previous, panel_preferences: { ...(previous.panel_preferences as Record<string, import('@/integrations/supabase/types').Json>), [key]: value } }))} /></Label>)}</div></section>
    <WeeklyQuietHours value={local} onChange={week => setLocal(previous => ({ ...previous, quiet_hours_weekly: week }))} />
    <Button className="w-full" disabled={preferences.save.isPending || !quietWeekValid(quietWeekFromPreferences(local))} onClick={() => preferences.save.mutate(local, { onSuccess: () => { toast.success('העדפות ההתראות נשמרו'); onSaved?.(); }, onError: () => toast.error('לא ניתן לשמור כרגע. נסו שוב.') })}>{preferences.save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירה'}</Button>
  </div>;
}
