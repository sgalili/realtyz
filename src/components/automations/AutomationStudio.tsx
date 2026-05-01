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
  { value: 'prospect_added', label: 'New prospect added' },
  { value: 'meeting_booked', label: 'Meeting booked / negotiation started' },
  { value: 'followup_after_hours', label: 'Follow-up after 48h of silence' },
  { value: 'birthday_anniversary', label: 'Prospect birthday / anniversary' },
];

const ACTIONS = [
  { value: 'send_whatsapp', label: 'Send WhatsApp message' },
  { value: 'create_note', label: 'Create internal note' },
  { value: 'notify_agent', label: 'Notify me on WhatsApp' },
  { value: 'composite', label: 'All of the above' },
];

const TEMPLATES = [
  {
    key: 'welcome',
    name: 'New Prospect Welcome',
    description: 'Greet a brand-new lead with a friendly intro.',
    trigger_type: 'prospect_added',
    action_type: 'composite',
    action_config: {
      message_template:
        'Hi {{first_name}}! Thanks for reaching out — I\'m here to help you find the right property. When is a good time to chat?',
      note_title: 'Welcome sent to {{name}}',
      note_body: 'Auto welcome sent on first contact.',
      notify_event_type: 'new_high_priority',
      notify_detail: 'New prospect just signed up — auto-welcome sent.',
    },
  },
  {
    key: 'followup_48h',
    name: 'Follow-up after 48h',
    description: 'Re-engage prospects who went quiet for 2 days.',
    trigger_type: 'followup_after_hours',
    action_type: 'send_whatsapp',
    action_config: {
      delay_hours: 48,
      message_template:
        'Hi {{first_name}}, just checking in — did you get a chance to look at the options I shared? Happy to send more.',
    },
  },
  {
    key: 'birthday',
    name: 'Birthday / Anniversary greeting',
    description: 'Send a warm message on a special date.',
    trigger_type: 'birthday_anniversary',
    action_type: 'send_whatsapp',
    action_config: {
      message_template:
        'Wishing you a wonderful day, {{first_name}}! 🎉 Hope this year brings you the home you\'re dreaming of.',
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
    trigger_type: 'prospect_added',
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
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('automations').insert({
        user_id: user.id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Automation created');
      setOpen(false);
      setDraft(emptyDraft());
      qc.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save'),
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
      toast.success('Automation deleted');
      qc.invalidateQueries({ queryKey: ['automations'] });
    },
  });

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setDraft({
      name: t.name,
      description: t.description,
      trigger_type: t.trigger_type,
      action_type: t.action_type,
      is_enabled: true,
      template_key: t.key,
      action_config: { ...emptyDraft().action_config, ...t.action_config },
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Pre-built Templates</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => applyTemplate(t)}
              className="text-left rounded-lg border p-3 hover:border-primary hover:bg-muted/50 transition"
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
          <h3 className="text-sm font-semibold">Your Workflows</h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto h-8">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Build an automation</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Welcome new leads"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">If this happens (Trigger)</Label>
                    <Select value={draft.trigger_type} onValueChange={(v) => setDraft({ ...draft, trigger_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Then do this (Action)</Label>
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
                    <Label className="text-xs">WhatsApp message template</Label>
                    <Textarea
                      rows={3}
                      placeholder="Hi {{first_name}}, …"
                      value={draft.action_config.message_template}
                      onChange={(e) => setDraft({
                        ...draft,
                        action_config: { ...draft.action_config, message_template: e.target.value },
                      })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Variables: {`{{name}} {{first_name}} {{phone}} {{city}}`}
                    </p>
                  </div>
                )}

                {(draft.action_type === 'create_note' || draft.action_type === 'composite') && (
                  <div className="grid gap-2">
                    <Input
                      placeholder="Note title"
                      value={draft.action_config.note_title}
                      onChange={(e) => setDraft({
                        ...draft,
                        action_config: { ...draft.action_config, note_title: e.target.value },
                      })}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Note body"
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
                      <Label className="text-xs">Notification type</Label>
                      <Select
                        value={draft.action_config.notify_event_type}
                        onValueChange={(v: any) => setDraft({
                          ...draft,
                          action_config: { ...draft.action_config, notify_event_type: v },
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new_high_priority">High priority</SelectItem>
                          <SelectItem value="meeting_booked">Meeting</SelectItem>
                          <SelectItem value="critical_question">Critical question</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Detail</Label>
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
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  disabled={!draft.name || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(draft)}
                >
                  Save automation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !automations?.length ? (
          <p className="text-xs text-muted-foreground">
            No automations yet. Pick a template above or click "New" to create one.
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
                    → {ACTIONS.find((x) => x.value === a.action_type)?.label || a.action_type}
                    {a.run_count ? ` • ${a.run_count} runs` : ''}
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
