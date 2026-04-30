import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Phone, MessageSquare, Sparkles, Megaphone, Inbox, Radio } from 'lucide-react';
import { toast } from 'sonner';

const SERVICES = [
  { key: 'ai_voice', label: 'שיחות AI (Touchpoint)', desc: 'בוט קולי שמתקשר לבוחרים חמים', icon: Phone },
  { key: 'whatsapp', label: 'WhatsApp', desc: 'שליחה וקבלה דרך הערוץ העסקי המחובר', icon: MessageSquare },
  { key: 'sms', label: 'SMS Blast', desc: 'משלוח המוני דרך ספק ההודעות המחובר', icon: Radio },
  { key: 'ai_content', label: 'מחולל תוכן AI', desc: 'יצירת פוסטים, סלוגנים ותגובות', icon: Sparkles },
  { key: 'meta_ads', label: 'סנכרון Meta Ads', desc: 'העברת קהלים לפייסבוק/אינסטגרם', icon: Megaphone },
  { key: 'omnichannel_inbox', label: 'תיבת Omnichannel', desc: 'איחוד כל הערוצים לתיבה אחת', icon: Inbox },
];

export function ServiceTogglesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: toggles = [] } = useQuery({
    queryKey: ['service-toggles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('service_toggles')
        .select('*')
        .eq('user_id', user!.id);
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const existing = toggles.find((t) => t.service_key === key);
      if (existing) {
        const { error } = await supabase
          .from('service_toggles')
          .update({ enabled })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('service_toggles')
          .insert({ user_id: user!.id, service_key: key, enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-toggles'] });
      toast.success('שירות עודכן');
    },
  });

  const isEnabled = (key: string) => {
    const t = toggles.find((x) => x.service_key === key);
    return t ? t.enabled : true; // default enabled
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">הפעלת שירותים</CardTitle>
        <CardDescription>שלוט על השירותים הפעילים בחשבונך. כבוי = לא יחויב ולא ישלח</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const on = isEnabled(s.key);
          return (
            <div key={s.key} className="flex items-center gap-3 p-3 rounded-lg border bg-card/50">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
              <Switch checked={on} onCheckedChange={(v) => toggle.mutate({ key: s.key, enabled: v })} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
