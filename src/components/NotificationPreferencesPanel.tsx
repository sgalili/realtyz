import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Flame, CalendarCheck, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { Link } from 'react-router-dom';

type Prefs = {
  id?: string;
  user_id?: string;
  notify_new_high_priority: boolean;
  notify_meeting_booked: boolean;
  notify_critical_question: boolean;
  delivery_channel: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

type NotificationRow = {
  id: string;
  event_type: 'new_high_priority' | 'meeting_booked' | 'critical_question';
  title: string;
  body: string;
  deep_link: string;
  delivered: boolean;
  created_at: string;
  lead_id: string | null;
};

const EVENT_META: Record<NotificationRow['event_type'], { icon: typeof Flame; color: string; label: string }> = {
  new_high_priority: { icon: Flame, color: 'text-warning', label: 'New Hot Lead' },
  meeting_booked: { icon: CalendarCheck, color: 'text-success', label: 'Meeting Booked' },
  critical_question: { icon: AlertTriangle, color: 'text-destructive', label: 'Critical Question' },
};

const DEFAULTS: Prefs = {
  notify_new_high_priority: true,
  notify_meeting_booked: true,
  notify_critical_question: true,
  delivery_channel: 'whatsapp',
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export default function NotificationPreferencesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [local, setLocal] = useState<Prefs>(DEFAULTS);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notification-preferences', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Prefs) || { ...DEFAULTS, user_id: user!.id };
    },
  });

  useEffect(() => {
    if (prefs) setLocal(prefs);
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async (next: Prefs) => {
      if (!user?.id) throw new Error('Not authenticated');
      const payload = { ...next, user_id: user.id };
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('העדפות ההתראות נשמרו');
      qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (e: any) => toast.error(e?.message || 'שמירה נכשלה'),
  });

  const toggle = (key: keyof Prefs) => (val: boolean) => {
    setLocal((p) => ({ ...p, [key]: val }));
  };

  // Recent notifications log (last 10)
  const { data: recent } = useQuery({
    queryKey: ['recent-notifications', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, event_type, title, body, deep_link, delivered, created_at, lead_id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as NotificationRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">העדפות התראות</CardTitle>
              <CardDescription className="text-xs">
                Notification Preferences — בחר אילו אירועים קריטיים יישלחו אליך ב-WhatsApp עם קישור ישיר לעסקאות
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען העדפות...
            </div>
          ) : (
            <>
              <ToggleRow
                icon={Flame}
                iconColor="text-warning"
                title="New Hot Lead"
                description="התראה כאשר נוסף ליד חדש בעדיפות גבוהה (Hot Lead)"
                checked={local.notify_new_high_priority}
                onCheckedChange={toggle('notify_new_high_priority')}
              />
              <ToggleRow
                icon={CalendarCheck}
                iconColor="text-success"
                title="Meeting Booked"
                description="התראה כאשר ליד נכנס לשלב 'משא ומתן / פגישה'"
                checked={local.notify_meeting_booked}
                onCheckedChange={toggle('notify_meeting_booked')}
              />
              <ToggleRow
                icon={AlertTriangle}
                iconColor="text-destructive"
                title="Critical Question"
                description="התראה מיידית כאשר ליד שואל שאלה קריטית הדורשת התערבות אנושית"
                checked={local.notify_critical_question}
                onCheckedChange={toggle('notify_critical_question')}
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label htmlFor="quiet_start" className="text-xs">Quiet hours — התחלה (UTC)</Label>
                  <Input
                    id="quiet_start"
                    type="time"
                    value={local.quiet_hours_start || ''}
                    onChange={(e) =>
                      setLocal((p) => ({ ...p, quiet_hours_start: e.target.value || null }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="quiet_end" className="text-xs">Quiet hours — סיום (UTC)</Label>
                  <Input
                    id="quiet_end"
                    type="time"
                    value={local.quiet_hours_end || ''}
                    onChange={(e) =>
                      setLocal((p) => ({ ...p, quiet_hours_end: e.target.value || null }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate(local)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  שמירה
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">היסטוריית התראות אחרונות</CardTitle>
          <CardDescription className="text-xs">10 ההתראות האחרונות שנשלחו אליך</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            {!recent || recent.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">אין התראות עדיין</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((n) => {
                  const meta = EVENT_META[n.event_type];
                  const Icon = meta?.icon || Bell;
                  return (
                    <li
                      key={n.id}
                      className="flex items-start gap-3 rounded-md border border-border/40 p-2 text-xs"
                    >
                      <Icon className={`h-4 w-4 mt-0.5 ${meta?.color || 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{meta?.label || n.event_type}</span>
                          <Badge variant={n.delivered ? 'default' : 'secondary'} className="text-[10px]">
                            {n.delivered ? 'נשלח' : 'לא נשלח'}
                          </Badge>
                          <span className="text-muted-foreground mr-auto">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: he })}
                          </span>
                        </div>
                        <p className="text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                        {n.lead_id && (
                          <Link
                            to={`/deal-room?leadId=${n.lead_id}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            פתח עסקאות
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  iconColor,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: typeof Flame;
  iconColor: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/40 p-3">
      <Icon className={`h-5 w-5 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
