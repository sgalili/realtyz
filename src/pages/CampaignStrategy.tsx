import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Minus, Plus, Save } from 'lucide-react';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { VOTES_PER_MANDATE } from '@/lib/mandateCalculator';

const TONE_OPTIONS = [
  { value: 'warm_friendly', label: 'חם וידידותי', desc: 'שפה קרובה ואישית, כמו חבר טוב' },
  { value: 'professional_formal', label: 'מקצועי ורשמי', desc: 'טון עסקי ומכובד' },
  { value: 'urgent_political', label: 'דחוף ופוליטי', desc: 'קריאה לפעולה, תחושת דחיפות' },
  { value: 'empathetic_caring', label: 'אמפתי ואכפתי', desc: 'הקשבה והבנה, דגש על ערכים' },
  { value: 'sharp_assertive', label: 'חד ונחוש', desc: 'ישיר, ללא פשרות, מנהיגותי' },
];

export default function CampaignStrategy() {
  const queryClient = useQueryClient();
  const blockDemoAction = useDemoGuard();
  const [tone, setTone] = useState('warm_friendly');
  const [focus, setFocus] = useState('');
  const [mandateTarget, setMandateTarget] = useState('2');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['campaign-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_settings')
        .select('key, value');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map(r => [r.key, r.value]));
    },
  });

  useEffect(() => {
    if (settings) {
      setTone(settings.ai_tone || 'warm_friendly');
      setFocus(settings.current_focus || '');
      setMandateTarget(settings.mandate_target || `${Math.max(1, Math.round(Number(settings.winning_threshold || 60000) / VOTES_PER_MANDATE))}`);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('save-campaign-strategy')) throw new Error('demo-blocked');
      const updates = [
        { key: 'ai_tone', value: tone },
        { key: 'current_focus', value: focus },
        { key: 'mandate_target', value: mandateTarget },
      ];
      for (const u of updates) {
        const { data, error } = await supabase
          .from('campaign_settings')
          .update({ value: u.value, updated_at: new Date().toISOString() })
          .eq('key', u.key)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          const { error: insertError } = await supabase
            .from('campaign_settings')
            .insert({ key: u.key, value: u.value });
          if (insertError) throw insertError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-settings'] });
      toast.success('הגדרות הקמפיין נשמרו בהצלחה');
    },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error('שגיאה בשמירת ההגדרות'); },
  });

  const selectedTone = TONE_OPTIONS.find(t => t.value === tone);
  const updateMandateTarget = (nextValue: string | number) => {
    const digits = String(nextValue).replace(/\D/g, '').slice(0, 2);
    setMandateTarget(digits || '1');
  };

  const stepMandateTarget = (direction: 1 | -1) => {
    const current = Number(mandateTarget || 1);
    updateMandateTarget(Math.min(99, Math.max(1, current + direction)));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-primary">אסטרטגיית קמפיין</h2>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tone Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              טון ה-AI
            </CardTitle>
            <CardDescription>בחר את סגנון התקשורת של ה-AI עם אנשי הקשר</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="בחר טון" />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTone && (
              <p className="pt-[3px] text-xs text-muted-foreground">{selectedTone.desc}</p>
            )}
          </CardContent>
        </Card>

        {/* Current Focus */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              מיקוד נוכחי
            </CardTitle>
            <CardDescription>מה ה-AI צריך להדגיש השבוע?</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={focus}
              onChange={e => setFocus(e.target.value)}
              placeholder="לדוגמה: להתמקד בפתיחת הפארק החדש בראשון לציון ולהזמין תושבים לאירוע..."
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {focus.length}/500 תווים
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Target */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            יעד עסקאות
          </CardTitle>
          <CardDescription>מספר העסקאות שהקמפיין שואף להשיג - ממנו מחושבים יעד הקולות וההתקדמות בלוח הבקרה</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
              <div className="mx-auto flex w-fit items-center overflow-hidden rounded-md border border-input bg-background">
                <Button type="button" variant="ghost" size="icon" className="h-12 w-14 rounded-none text-lg" onClick={() => stepMandateTarget(-1)} aria-label="הפחת עסקה">
                  <Minus className="h-5 w-5" />
                </Button>
                <input
                  id="transaction-target"
                  value={mandateTarget}
                  onChange={e => updateMandateTarget(e.target.value)}
                  inputMode="numeric"
                  maxLength={2}
                  className="h-12 w-20 border-x border-input bg-transparent text-center text-2xl font-bold outline-none"
                />
                <Button type="button" variant="ghost" size="icon" className="h-12 w-14 rounded-none text-lg" onClick={() => stepMandateTarget(1)} aria-label="הוסף עסקה">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            <p className="text-base text-muted-foreground text-center">
              {Number(mandateTarget || 0).toLocaleString()} עסקאות = {(Number(mandateTarget || 0) * VOTES_PER_MANDATE).toLocaleString()} קולות יעד
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Prompting Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-5">
          <div>
            <p className="text-sm font-medium">עדכון דינאמי</p>
            <p className="text-xs text-muted-foreground mt-1">
              ברגע שתשמור, ה-AI ימשוך את ההגדרות האלה באופן אוטומטי.
              כל שיחה חדשה תשקף את הטון והמיקוד שבחרת.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isLoading}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'שומר...' : 'שמור הגדרות'}
        </Button>
      </div>
    </div>
  );
}
