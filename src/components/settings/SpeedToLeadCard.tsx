import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuickTemplates, useSaveQuickTemplate, useDeleteQuickTemplate } from '@/hooks/useQuickTemplates';

type Settings = {
  user_id: string;
  greeting_enabled: boolean;
  greeting_body: string;
  followup_enabled: boolean;
  followup_delay_minutes: number;
  followup_body: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
};

const DEFAULTS: Omit<Settings, 'user_id'> = {
  greeting_enabled: false,
  greeting_body: 'היי {{name}}, זה אודי ויטמן. קיבלתי את הפנייה שלך ואחזור אליך עם התאמות רלוונטיות בקרוב.',
  followup_enabled: false,
  followup_delay_minutes: 120,
  followup_body: 'היי {{name}}, רק מוודא שראית את ההודעה שלי. מתי נוח לך לדבר?',
  quiet_hours_start: 22,
  quiet_hours_end: 8,
};

export function SpeedToLeadCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Omit<Settings, 'user_id'>>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['speed-to-lead-settings'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: row, error } = await supabase
        .from('speed_to_lead_settings')
        .select('*')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return row as Settings | null;
    },
  });

  useEffect(() => {
    if (data) {
      const { user_id: _ignored, ...rest } = data;
      setForm({ ...DEFAULTS, ...rest });
    }
  }, [data]);

  const save = async (patch?: Partial<Settings>) => {
    const next = { ...form, ...(patch || {}) };
    setForm(next);
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('לא מחובר');
      const { error } = await supabase
        .from('speed_to_lead_settings')
        .upsert({ user_id: auth.user.id, ...next }, { onConflict: 'user_id' });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['speed-to-lead-settings'] });
      toast.success('ההגדרות נשמרו');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">אוטומציית תגובה מהירה</h3>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Badge className="bg-emerald-600 text-white text-[10px]">Speed to Lead</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        כל מתעניין חדש שנכנס למערכת מקבל אוטומטית הודעת פתיחה, ואם צריך גם תזכורת מתוזמנת. כל שליחה נרשמת בציר הזמן של הלקוח.
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-sm font-medium">הודעת פתיחה מיידית</Label>
            <p className="text-xs text-muted-foreground">נשלחת מיד עם כניסת מתעניין חדש</p>
          </div>
          <Switch checked={form.greeting_enabled} onCheckedChange={(v) => save({ greeting_enabled: v })} />
        </div>
        <Textarea
          value={form.greeting_body}
          onChange={(e) => setForm({ ...form, greeting_body: e.target.value })}
          className="min-h-[70px] text-sm"
        />

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-sm font-medium">תזכורת מתוזמנת</Label>
            <p className="text-xs text-muted-foreground">נשלחת אם לא הייתה תגובה</p>
          </div>
          <Switch checked={form.followup_enabled} onCheckedChange={(v) => save({ followup_enabled: v })} />
        </div>
        <Textarea
          value={form.followup_body}
          onChange={(e) => setForm({ ...form, followup_body: e.target.value })}
          className="min-h-[70px] text-sm"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">השהיית תזכורת (דקות)</Label>
            <Input
              type="number"
              min={1}
              max={10080}
              value={form.followup_delay_minutes}
              onChange={(e) => setForm({ ...form, followup_delay_minutes: Number(e.target.value) || 1 })}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">שקט מהשעה</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.quiet_hours_start}
              onChange={(e) => setForm({ ...form, quiet_hours_start: Number(e.target.value) || 0 })}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">עד השעה</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={form.quiet_hours_end}
              onChange={(e) => setForm({ ...form, quiet_hours_end: Number(e.target.value) || 0 })}
              className="h-9"
            />
          </div>
        </div>

        <Button onClick={() => save()} disabled={saving} className="h-9">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ms-1">שמור הגדרות</span>
        </Button>
      </div>

      <QuickTemplatesManager />
    </div>
  );
}

function QuickTemplatesManager() {
  const { data: templates = [] } = useQuickTemplates();
  const saveTpl = useSaveQuickTemplate();
  const delTpl = useDeleteQuickTemplate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'both'>('whatsapp');
  const [scope, setScope] = useState<'lead' | 'listing' | 'both'>('lead');

  const add = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('נדרשים כותרת וטקסט');
      return;
    }
    try {
      await saveTpl.mutateAsync({ title: title.trim(), body: body.trim(), channel, scope });
      setTitle('');
      setBody('');
      toast.success('התבנית נוספה');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירה נכשלה');
    }
  };

  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <h4 className="text-sm font-semibold">תבניות הודעה מהירות</h4>
      <p className="text-xs text-muted-foreground">
        משתנים נתמכים: {'{{name}}'} {'{{city}}'} {'{{property}}'} {'{{price}}'}
      </p>

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{t.channel}</Badge>
                <Badge variant="outline" className="text-[10px]">{t.scope === 'listing' ? 'נכס' : t.scope === 'both' ? 'הכל' : 'לקוח'}</Badge>
              </div>
              <p className="text-xs text-muted-foreground break-words">{t.body}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delTpl.mutate(t.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת התבנית" className="h-9" />
        <div className="flex gap-2">
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="both">שניהם</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">לקוח</SelectItem>
              <SelectItem value="listing">נכס</SelectItem>
              <SelectItem value="both">הכל</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="טקסט ההודעה..." className="min-h-[70px] text-sm" />
      <Button size="sm" onClick={add} disabled={saveTpl.isPending} className="h-9">
        <Plus className="h-4 w-4" /><span className="ms-1">הוסף תבנית</span>
      </Button>
    </div>
  );
}

export default SpeedToLeadCard;
