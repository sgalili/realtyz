import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Bot, Plus, Trash2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

type Automation = {
  id: string;
  name: string;
  description: string | null;
  template_key: string | null;
  trigger_type: string;
  action_type: string;
  action_config: any;
  is_enabled: boolean;
  run_count: number;
  last_run_at: string | null;
};

const TRIGGERS = [
  { value: 'lead_added', label: 'לקוח חדש נוסף' },
  { value: 'meeting_booked', label: 'נקבעה פגישה / נפתח משא ומתן' },
  { value: 'followup_after_hours', label: 'מעקב לאחר 48 שעות שתיקה' },
  { value: 'birthday_anniversary', label: 'יום הולדת / יום נישואין של לקוח' },
];

const ACTIONS = [
  { value: 'send_whatsapp', label: 'שליחת הודעת WhatsApp' },
  { value: 'create_note', label: 'יצירת הערה פנימית' },
  { value: 'notify_agent', label: 'התראה אליי ב-WhatsApp' },
  { value: 'composite', label: 'כל הפעולות שלמעלה' },
];

const TEMPLATES = [
  {
    key: 'welcome',
    name: 'ברכת לקוח חדש',
    description: 'ברכו מתעניין טרי בהיכרות חמה.',
    trigger_type: 'lead_added',
    action_type: 'composite',
    action_config: {
      message_template:
        'היי {{first_name}}! תודה שפנית — אני כאן כדי לעזור לך למצוא את הנכס המתאים. מתי נוח לדבר?',
      note_title: 'נשלחה ברכת קבלה ל-{{name}}',
      note_body: 'נשלחה ברכת קבלה אוטומטית בפנייה הראשונה.',
      notify_event_type: 'new_high_priority',
      notify_detail: 'לקוח חדש נרשם — נשלחה ברכת קבלה אוטומטית.',
    },
  },
  {
    key: 'followup_48h',
    name: 'מעקב לאחר 48 שעות',
    description: 'חיברו מחדש לקוחות ששתקו יומיים.',
    trigger_type: 'followup_after_hours',
    action_type: 'send_whatsapp',
    action_config: {
      delay_hours: 48,
      message_template:
        'היי {{first_name}}, רק בודק/ת — הספקת להסתכל על האפשרויות ששלחתי? אשמח לשלוח עוד.',
    },
  },
  {
    key: 'birthday',
    name: 'ברכת יום הולדת / יום נישואין',
    description: 'שלחו הודעה חמה בתאריך מיוחד.',
    trigger_type: 'birthday_anniversary',
    action_type: 'send_whatsapp',
    action_config: {
      message_template:
        'מאחל/ת לך יום נפלא, {{first_name}}! 🎉 שהשנה הזו תביא לך את הבית שאתם חולמים עליו.',
    },
  },
];

type Draft = {
  name: string;
  description: string;
  trigger_type: string;
  action_type: string;
  is_enabled: boolean;
  template_key: string | null;
  action_config: {
    message_template: string;
    note_title: string;
    note_body: string;
    notify_event_type: 'new_high_priority' | 'meeting_booked' | 'critical_question';
    notify_detail: string;
    delay_hours?: number;
  };
};

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    trigger_type: 'lead_added',
    action_type: 'send_whatsapp',
    is_enabled: true,
    template_key: null,
    action_config: {
      message_template: '',
      note_title: '',
      note_body: '',
      notify_event_type: 'new_high_priority',
      notify_detail: '',
    },
  };
}

export function AutomationStudio() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());

  const { data: automations, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Automation[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error('לא מחובר');
      const { error } = await supabase.from('automations').insert({
        user_id: user.id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('האוטומציה נוצרה');
      setOpen(false);
      setDraft(emptyDraft());
      qc.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: (e: any) => toast.error(e?.message || 'שמירה נכשלה'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from('automations').update({ is_enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('האוטומציה נמחקה');
      qc.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  function applyTemplate(t: typeof TEMPLATES[number]) {
    const base = emptyDraft();
    setDraft({
      ...base,
      name: t.name,
      description: t.description,
      trigger_type: t.trigger_type,
      action_type: t.action_type,
      template_key: t.key,
      action_config: { ...base.action_config, ...(t.action_config as any) },
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">תבניות מוכנות מראש</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => applyTemplate(t)}
              className="text-right rounded-lg border p-3 hover:border-primary hover:bg-muted/50 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-medium">{t.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">הזרימים שלך</h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ms-auto h-8">
                <Plus className="h-3.5 w-3.5 ml-1" />
                חדש
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle>בניית אוטומציה</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">שם</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="לדוגמה: ברכת מתעניינים חדשים"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">אם זה קורה (טריגר)</Label>
                    <Select value={draft.trigger_type} onValueChange={(v) => setDraft({ ...draft, trigger_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">אז עשה את זה (פעולה)</Label>
                    <Select value={draft.action_type} onValueChange={(v) => setDraft({ ...draft, action_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(draft.action_type === 'send_whatsapp' || draft.action_type === 'composite') && (
                  <div>
                    <Label className="text-xs">תבנית הודעת WhatsApp</Label>
                    <Textarea
                      rows={3}
                      placeholder="היי {{first_name}}, …"
                      value={draft.action_config.message_template}
                      onChange={(e) => setDraft({
                        ...draft,
                        action_config: { ...draft.action_config, message_template: e.target.value },
                      })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      משתנים: {`{{name}} {{first_name}} {{phone}} {{city}}`}
                    </p>
                  </div>
                )}

                {(draft.action_type === 'create_note' || draft.action_type === 'composite') && (
                  <div className="grid gap-2">
                    <Input
                      placeholder="כותרת ההערה"
                      value={draft.action_config.note_title}
                      onChange={(e) => setDraft({
                        ...draft,
                        action_config: { ...draft.action_config, note_title: e.target.value },
                      })}
                    />
                    <Textarea
                      rows={2}
                      placeholder="גוף ההערה"
                      value={draft.action_config.note_body}
                      onChange={(e) => setDraft({
                        ...draft,
                        action_config: { ...draft.action_config, note_body: e.target.value },
                      })}
                    />
                  </div>
                )}

                {(draft.action_type === 'notify_agent' || draft.action_type === 'composite') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">סוג התראה</Label>
                      <Select
                        value={draft.action_config.notify_event_type}
                        onValueChange={(v: any) => setDraft({
                          ...draft,
                          action_config: { ...draft.action_config, notify_event_type: v },
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new_high_priority">עדיפות גבוהה</SelectItem>
                          <SelectItem value="meeting_booked">פגישה</SelectItem>
                          <SelectItem value="critical_question">שאלה קריטית</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">פירוט</Label>
                      <Input
                        value={draft.action_config.notify_detail}
                        onChange={(e) => setDraft({
                          ...draft,
                          action_config: { ...draft.action_config, notify_detail: e.target.value },
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
                <Button
                  disabled={!draft.name || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  שמירת אוטומציה
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">טוען…</p>
        ) : !automations?.length ? (
          <p className="text-xs text-muted-foreground">
            אין אוטומציות עדיין. בחרו תבנית למעלה או לחצו "חדש" כדי ליצור אחת.
          </p>
        ) : (
          <ul className="divide-y">
            {automations.map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-3">
                <Switch
                  checked={a.is_enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: a.id, is_enabled: v })}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {TRIGGERS.find((t) => t.value === a.trigger_type)?.label || a.trigger_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    ← {ACTIONS.find((x) => x.value === a.action_type)?.label || a.action_type}
                    {a.run_count ? ` • ${a.run_count} הרצות` : ''}
                  </p>
                </div>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
