import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { Clock, FileText, MessageCircle, Phone, Share2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DeliverySettings } from '@/components/DeliverySettings';

type ScheduledItem = {
  id: string;
  title: string;
  content: string;
  item_type: string;
  channel: string;
  status: string;
  scheduled_for: string;
  target_audience: string | null;
  drip_enabled: boolean;
  daily_limit: number;
  send_window_start: string;
  send_window_end: string;
  stagger_min_minutes: number;
  stagger_max_minutes: number;
  sent_count: number;
  total_recipients: number;
};

const statusMap: Record<string, string> = {
  pending: '⏳ ממתין',
  approved: '✅ מאושר',
  in_progress: '🚀 בתהליך',
  posted: 'פורסם',
  needs_reverification: 'בדיקה חוזרת',
};

const itemTypeLabels: Record<string, string> = {
  social_post: 'פוסט סושיאל',
  whatsapp_blast: 'הפצת WhatsApp',
  sms_campaign: 'קמפיין SMS',
  push: 'התראת Push',
};

const channelLabels: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  push: 'Push',
};

const ItemIcon = ({ type, channel }: { type: string; channel: string }) => {
  const className = 'h-3.5 w-3.5 text-primary';
  if (type === 'sms_campaign' || channel === 'sms') return <Phone className={className} />;
  if (type === 'whatsapp_blast' || channel === 'whatsapp') return <MessageCircle className={className} />;
  return <Share2 className={className} />;
};

const buildDemoItems = (): ScheduledItem[] => {
  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = addDays(startOfDay(now), dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const base = (overrides: Partial<ScheduledItem>): ScheduledItem => ({
    id: crypto.randomUUID(),
    title: '', content: '', item_type: 'social_post', channel: 'facebook',
    status: 'approved', scheduled_for: at(0, 9), target_audience: 'כללי',
    drip_enabled: false, daily_limit: 0, send_window_start: '09:00:00',
    send_window_end: '20:00:00', stagger_min_minutes: 7, stagger_max_minutes: 23,
    sent_count: 0, total_recipients: 0, ...overrides,
  });
  return [
    // History (past)
    base({ title: 'סיכום שבוע - הישגי הקמפיין', content: 'פוסט סיכום שבועי עם דגש על עסקאות שנוספו וחיבור לבסיס התומכים.', item_type: 'social_post', channel: 'facebook', status: 'posted', scheduled_for: at(-5, 10), sent_count: 1, total_recipients: 1 }),
    base({ title: 'תזכורת התנדבות בשטח', content: 'SMS לפעילי שטח עם פרטי המפגש השבועי במטה.', item_type: 'sms_campaign', channel: 'sms', status: 'posted', scheduled_for: at(-4, 17), drip_enabled: true, daily_limit: 120, sent_count: 480, total_recipients: 480 }),
    base({ title: 'עדות מהשטח - חיפה', content: 'סטורי אינסטגרם עם תושב חיפה שמסביר למה הצטרף לקמפיין.', item_type: 'social_post', channel: 'instagram', status: 'posted', scheduled_for: at(-3, 19), sent_count: 1, total_recipients: 1 }),
    base({ title: 'קמפיין WhatsApp לתומכים חמים', content: 'הודעת WhatsApp אישית לרשימת התומכים החמים, עם בקשה להפצה למשפחה.', item_type: 'whatsapp_blast', channel: 'whatsapp', status: 'posted', scheduled_for: at(-2, 11), drip_enabled: true, daily_limit: 200, sent_count: 1240, total_recipients: 1240 }),
    base({ title: 'הצהרת עמדה - יוקר המחיה', content: 'פוסט פייסבוק רגוע ומבוסס נתונים בנושא יוקר המחיה.', item_type: 'social_post', channel: 'facebook', status: 'posted', scheduled_for: at(-1, 14), sent_count: 1, total_recipients: 1 }),

    // Today
    base({ title: 'בוקר טוב לפעילים', content: 'התראת Push יומית לפעילים עם משימת היום.', item_type: 'push', channel: 'push', status: 'in_progress', scheduled_for: at(0, 8), sent_count: 320, total_recipients: 540 }),
    base({ title: 'פוסט מרכזי - חזון לקהילה', content: 'פוסט פייסבוק שמציג את החזון לחמש שנים הקרובות.', item_type: 'social_post', channel: 'facebook', status: 'approved', scheduled_for: at(0, 12) }),
    base({ title: 'סטורי אינסטגרם - מאחורי הקלעים', content: 'סדרת סטוריז עם הנכס במהלך פגישת תושבים.', item_type: 'social_post', channel: 'instagram', status: 'needs_reverification', scheduled_for: at(0, 18, 30) }),

    // Tomorrow
    base({ title: 'הזמנה לכנס תושבים', content: 'הודעת WhatsApp עם לינק להרשמה לכנס.', item_type: 'whatsapp_blast', channel: 'whatsapp', status: 'approved', scheduled_for: at(1, 10), drip_enabled: true, daily_limit: 250, total_recipients: 1800 }),
    base({ title: 'פוסט שאלת מעורבות', content: 'מהו הנושא הכי חשוב לך בקמפיין הקרוב?', item_type: 'social_post', channel: 'x', status: 'pending', scheduled_for: at(1, 15) }),

    // Day +2
    base({ title: 'SMS תזכורת אירוע', content: 'תזכורת לאירוע התומכים בערב.', item_type: 'sms_campaign', channel: 'sms', status: 'approved', scheduled_for: at(2, 11), drip_enabled: true, daily_limit: 150, total_recipients: 600 }),
    base({ title: 'המלצת AI - הנעה לפעולה', content: 'פוסט אינסטגרם עם CTA להצטרפות לקבוצת WhatsApp הקהילתית.', item_type: 'social_post', channel: 'instagram', status: 'pending', scheduled_for: at(2, 17) }),

    // Day +3
    base({ title: 'הבהרת עמדה - בריאות', content: 'פוסט פייסבוק על תוכנית הבריאות הקהילתית.', item_type: 'social_post', channel: 'facebook', status: 'needs_reverification', scheduled_for: at(3, 13) }),

    // Day +4
    base({ title: 'הפצת WhatsApp - עדכון שבועי', content: 'עדכון שבועי לכל הרשימה החמה.', item_type: 'whatsapp_blast', channel: 'whatsapp', status: 'pending', scheduled_for: at(4, 9, 30), drip_enabled: true, daily_limit: 300, total_recipients: 2400 }),
    base({ title: 'התראת Push - סקר קהל', content: 'סקר קצר עם 3 שאלות על נושאי הקמפיין.', item_type: 'push', channel: 'push', status: 'approved', scheduled_for: at(4, 19) }),

    // Day +5
    base({ title: 'פוסט סיכום שבוע', content: 'פוסט פייסבוק שמסכם את אירועי השבוע ומחבר אותם ליעד העסקאות.', item_type: 'social_post', channel: 'facebook', status: 'pending', scheduled_for: at(5, 16) }),

    // Day +6
    base({ title: 'קמפיין SMS - יום ההצבעה', content: 'תזכורת ביום ההצבעה לכל הרשימה.', item_type: 'sms_campaign', channel: 'sms', status: 'pending', scheduled_for: at(6, 8), drip_enabled: true, daily_limit: 500, total_recipients: 5000 }),
  ];
};

const DEMO_SETTINGS: Record<string, string> = {
  current_focus: 'הגדלת אמון, גיוס תומכים והנעה להצבעה',
  mandate_target: '4',
};

export default function ContentCalendar() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const qc = useQueryClient();
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [reverifyBeforePost, setReverifyBeforePost] = useState(true);
  const [form, setForm] = useState({
    title: '',
    content: '',
    item_type: 'social_post',
    channel: 'facebook',
    scheduled_for: format(addDays(new Date(), 1), "yyyy-MM-dd'T'09:00"),
    target_audience: '',
    drip_enabled: false,
    daily_limit: 50,
    send_window_start: '09:00',
    send_window_end: '20:00',
    stagger_min_minutes: 7,
    stagger_max_minutes: 23,
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i)), []);
  const demoItems = useMemo(() => (isDemoMode ? buildDemoItems() : []), [isDemoMode]);

  const { data: items = [] } = useQuery({
    queryKey: ['scheduled-items', user?.id, isDemoMode],
    enabled: !!user?.id || isDemoMode,
    queryFn: async () => {
      if (isDemoMode) return demoItems;
      const { data, error } = await (supabase as any).from('scheduled_items').select('*').order('scheduled_for', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduledItem[];
    },
    refetchInterval: isDemoMode ? false : 20_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['campaign-settings-calendar'],
    queryFn: async () => {
      const { data } = await supabase.from('campaign_settings').select('key,value');
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
    },
  });

  useQuery({
    queryKey: ['delivery-policy', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('service_toggles').select('*').eq('service_key', 'delivery_policy').maybeSingle();
      const value = data?.config?.reverify_before_post ?? true;
      setReverifyBeforePost(value);
      return data;
    },
  });

  const savePolicy = useMutation({
    mutationFn: async (value: boolean) => {
      const payload = { reverify_before_post: value, auto_post_once_approved: !value };
      const { data: existing } = await (supabase as any).from('service_toggles').select('id').eq('service_key', 'delivery_policy').maybeSingle();
      if (existing?.id) {
        const { error } = await (supabase as any).from('service_toggles').update({ config: payload, enabled: true }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('service_toggles').insert({ user_id: user!.id, service_key: 'delivery_policy', enabled: true, config: payload });
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success('כלל הפרסום נשמר'),
    onError: () => toast.error('שמירת כלל הפרסום נכשלה'),
  });

  const createItem = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { error } = await (supabase as any).from('scheduled_items').insert({
        user_id: user!.id,
        title: payload.title,
        content: payload.content,
        item_type: payload.item_type,
        channel: payload.channel,
        status: reverifyBeforePost ? 'needs_reverification' : 'approved',
        scheduled_for: new Date(payload.scheduled_for).toISOString(),
        target_audience: payload.target_audience || null,
        drip_enabled: payload.drip_enabled,
        daily_limit: payload.drip_enabled ? Number(payload.daily_limit) : 0,
        send_window_start: payload.send_window_start,
        send_window_end: payload.send_window_end,
        stagger_min_minutes: payload.stagger_min_minutes,
        stagger_max_minutes: payload.stagger_max_minutes,
        metadata: { source: uploadedFiles.length ? 'calendar_file_upload' : 'calendar_manual', reverify_one_hour_before: reverifyBeforePost, files: uploadedFiles.map((file) => ({ name: file.name, type: file.type, size: file.size })) },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הפריט נוסף ליומן');
      qc.invalidateQueries({ queryKey: ['scheduled-items'] });
      setForm((current) => ({ ...current, title: '', content: '' }));
      setUploadedFiles([]);
    },
    onError: () => toast.error('שמירת הפריט נכשלה'),
  });

  const aiWeek = useMutation({
    mutationFn: async () => {
      const focus = settings?.current_focus || 'הגדלת אמון, גיוס תומכים והנעה להצבעה';
      const mandateGoal = settings?.mandate_target || '2';
      const templates = [
        ['מסר פתיחת שבוע', 'פוסט סושיאל שמחבר את יעד הקמפיין לנושא המרכזי השבוע'],
        ['עדות מהשטח', 'פוסט קצר שמדגיש צורך אמיתי של אנשי קשר ומענה קונקרטי'],
        ['הנעה לשיחה', 'SMS ממוקד שמזמין תומכים לענות ולהצטרף למעגל הפעילים'],
        ['הבהרת עמדה', 'פוסט רגוע וברור שמסביר את עמדת הקמפיין ללא הסלמה'],
        ['תזכורת לפעילים', 'התראת Push עם משימה אחת פשוטה ליום הפעילות'],
        ['שאלת מעורבות', 'פוסט שמבקש תגובות מהציבור ומזהה נושאים חמים'],
        ['סיכום שבוע', 'פוסט שמסכם הישגים ומחבר אותם ליעד העסקאות'],
      ];
      const rows = templates.map(([title, idea], index) => ({
        user_id: user!.id,
        title: `המלצת AI: ${title}`,
        content: `${idea}. מיקוד: ${focus}. יעד עסקאות: ${mandateGoal}. נדרש אישור אנושי לפני פרסום.`,
        item_type: index === 2 ? 'sms_campaign' : index === 4 ? 'push' : 'social_post',
        channel: index === 2 ? 'sms' : index === 4 ? 'push' : index % 2 ? 'instagram' : 'facebook',
        status: 'pending',
        scheduled_for: addDays(new Date(new Date().setHours(9 + (index % 4) * 2, 0, 0, 0)), index).toISOString(),
        target_audience: 'כללי',
        drip_enabled: index === 2,
        daily_limit: index === 2 ? 75 : 0,
        send_window_start: '09:00',
        send_window_end: '20:00',
        stagger_min_minutes: 9,
        stagger_max_minutes: 27,
        metadata: { source: 'ai_weekly_recommendation', strict_review: true },
      }));
      const { error } = await (supabase as any).from('scheduled_items').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('AI הכין שבוע תוכן ביומן - כולם ממתינים לאישור');
      qc.invalidateQueries({ queryKey: ['scheduled-items'] });
    },
    onError: () => toast.error('יצירת המלצות AI נכשלה'),
  });

  const grouped = useMemo(() => days.map((day) => ({
    day,
    items: items.filter((item) => isSameDay(new Date(item.scheduled_for), day)),
  })), [days, items]);

  const history = useMemo(
    () => items
      .filter((item) => new Date(item.scheduled_for) < startOfDay(new Date()) || item.status === 'posted')
      .sort((a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime())
      .slice(0, 8),
    [items],
  );

  const handleFileSelection = (files: FileList | null) => {
    const nextFiles = Array.from(files ?? []);
    setUploadedFiles(nextFiles);
    if (!nextFiles.length) return;
    setForm((current) => ({
      ...current,
      title: current.title || nextFiles[0].name.replace(/\.[^.]+$/, ''),
      content: current.content || `קבצים לתזמון:\n${nextFiles.map((file) => `• ${file.name}`).join('\n')}`,
    }));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-primary">יומן תוכן ותזמון</h2>
        <p className="text-sm text-muted-foreground">העלאת קבצים, תזמון פרסומים והגנות מנוע השליחה לפני הפצה.</p>
      </header>

      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-1">
            <p className="text-sm font-semibold">כלל בקרה אנושית גלובלי</p>
            <p className="text-xs text-muted-foreground">בחר האם כל תוכן מתוזמן חייב בדיקה חוזרת שעה לפני פרסום, או שמותר לפרסם אוטומטית אחרי אישור.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">פרסום אוטומטי לאחר אישור</span>
            <Switch checked={reverifyBeforePost} onCheckedChange={(value) => { setReverifyBeforePost(value); savePolicy.mutate(value); }} />
            <span className="text-xs font-medium text-primary">בדיקה חוזרת שעה לפני</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">העלאת קבצים לתזמון</CardTitle>
              <CardDescription>בחר קבצי תוכן, הוסף פרטים בסיסיים ושמור אותם ביומן.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-right" dir="rtl">
              <Label htmlFor="calendar-files">קבצים</Label>
              <Input id="calendar-files" type="file" multiple dir="rtl" className="text-right file:ml-3 file:mr-0" onChange={(event) => handleFileSelection(event.target.files)} />
              {uploadedFiles.length > 0 ? (
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  {uploadedFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{Math.ceil(file.size / 1024).toLocaleString()}KB</span>
                      <span className="flex min-w-0 items-center gap-2 text-right"><FileText className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{file.name}</span></span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">עדיין לא נבחרו קבצים</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">פריט חדש ביומן</CardTitle>
              <CardDescription>כל פריט ידני יכבד את כלל הפרסום הגלובלי.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-right" dir="rtl">
              <div className="space-y-1"><Label>כותרת</Label><Input dir="rtl" className="text-right placeholder:text-right" placeholder="שם הפריט ביומן" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>סוג</Label><Select dir="rtl" value={form.item_type} onValueChange={(value) => setForm({ ...form, item_type: value, channel: value === 'sms_campaign' ? 'sms' : value === 'whatsapp_blast' ? 'whatsapp' : value === 'push' ? 'push' : form.channel })}><SelectTrigger className="text-right"><SelectValue placeholder="בחר סוג" /></SelectTrigger><SelectContent align="end" className="text-right">{Object.entries(itemTypeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>ערוץ</Label><Select dir="rtl" value={form.channel} onValueChange={(value) => setForm({ ...form, channel: value })}><SelectTrigger className="text-right"><SelectValue placeholder="בחר ערוץ" /></SelectTrigger><SelectContent align="end" className="text-right">{Object.entries(channelLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-1"><Label>מועד</Label><Input dir="rtl" className="text-right" type="datetime-local" value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} /></div>
              <div className="space-y-1"><Label>תוכן</Label><Textarea dir="rtl" className="min-h-28 text-right placeholder:text-right" placeholder="כתוב את תוכן הפרסום או הערות לקבצים" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <DeliverySettings enabled={form.drip_enabled} onEnabledChange={(value) => setForm({ ...form, drip_enabled: value })} dailyLimit={form.daily_limit} onDailyLimitChange={(value) => setForm({ ...form, daily_limit: value })} windowStart={form.send_window_start} onWindowStartChange={(value) => setForm({ ...form, send_window_start: value })} windowEnd={form.send_window_end} onWindowEndChange={(value) => setForm({ ...form, send_window_end: value })} delayMin={form.stagger_min_minutes} onDelayMinChange={(value) => setForm({ ...form, stagger_min_minutes: value })} delayMax={form.stagger_max_minutes} onDelayMaxChange={(value) => setForm({ ...form, stagger_max_minutes: value })} compact />
              <Button className="w-full" disabled={!form.title || !form.content || createItem.isPending} onClick={() => createItem.mutate(form)}><Clock className="h-4 w-4" /> הוסף ליומן</Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {grouped.map(({ day, items: dayItems }) => (
            <Card key={day.toISOString()} className="min-h-80 bg-card/80 transition-colors hover:bg-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm">{format(day, 'dd/MM')}</CardTitle><CardDescription>{format(day, 'EEEE', { locale: he })}</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {dayItems.map((item) => <div key={item.id} className="rounded-md border border-border bg-background p-2 text-xs"><div className="mb-1 flex items-center justify-between gap-1"><Badge variant="outline">{statusMap[item.status] || item.status}</Badge><ItemIcon type={item.item_type} channel={item.channel} /></div><p className="font-semibold leading-snug">{item.title}</p><p className="mt-1 text-muted-foreground">{format(new Date(item.scheduled_for), 'HH:mm')} · {channelLabels[item.channel] || item.channel}</p>{item.drip_enabled && <p className="mt-1 text-primary">טפטוף: {item.daily_limit}/יום · {item.send_window_start.slice(0,5)}-{item.send_window_end.slice(0,5)} · {item.stagger_min_minutes}-{item.stagger_max_minutes} דק׳</p>}</div>)}
                {dayItems.length === 0 && <p className="rounded-md border border-dashed border-border py-8 text-center text-xs text-muted-foreground">אין פריטים מתוזמנים</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> היסטוריית פרסומים</CardTitle>
            <CardDescription>פריטים שפורסמו לאחרונה.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {history.map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-background p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <Badge variant="secondary">{statusMap[item.status] || item.status}</Badge>
                    <ItemIcon type={item.item_type} channel={item.channel} />
                  </div>
                  <p className="font-semibold leading-snug">{item.title}</p>
                  <p className="mt-1 text-muted-foreground">{format(new Date(item.scheduled_for), 'dd/MM HH:mm')} · {channelLabels[item.channel] || item.channel}</p>
                  {item.total_recipients > 0 && (
                    <p className="mt-1 text-primary">נשלחו {item.sent_count.toLocaleString('he-IL')} מתוך {item.total_recipients.toLocaleString('he-IL')}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
