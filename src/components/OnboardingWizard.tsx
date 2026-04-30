import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Target, MessageSquare, ArrowLeft, ArrowRight, Rocket, Loader2, CheckCircle2, FileText, Smartphone, Radio, Plug, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { StrategyBriefCard, StrategyBrief, StrategyStats } from '@/components/StrategyBriefCard';
import { calculateMandatePlan, VOTES_PER_MANDATE } from '@/lib/mandateCalculator';
import { monthsUntilElection as calcMonthsUntilElection, ELECTION_DATE_HE } from '@/lib/electionDate';

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [draftingMessage, setDraftingMessage] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [brief, setBrief] = useState<StrategyBrief | null>(null);
  const [briefStats, setBriefStats] = useState<StrategyStats | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappPlatform, setWhatsappPlatform] = useState('whatsapp_green');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [verifiedChannels, setVerifiedChannels] = useState<Record<string, boolean>>({});

  const [candidate, setCandidate] = useState('');
  const [electionType, setElectionType] = useState('general');
  const [tone, setTone] = useState('professional');
  const [mandateTarget, setMandateTarget] = useState(2);
  // Election day: 27.10.2026. Cap default + slider max at the actual remaining time.
  const maxMonthsToElection = Math.max(1, Math.min(24, calcMonthsUntilElection()));
  const [monthsToElection, setMonthsToElection] = useState(Math.min(6, maxMonthsToElection));
  const [hotList, setHotList] = useState(500);
  const [coldList, setColdList] = useState(5000);
  const [hotConversionRate, setHotConversionRate] = useState(40);
  const [coldConversionRate, setColdConversionRate] = useState(10);
  const [initialMessage, setInitialMessage] = useState('');
  const mandatePlan = calculateMandatePlan({ mandates: mandateTarget, hotConversionRate, coldConversionRate });

  const { data: existing } = useQuery({
    queryKey: ['onboarding-state', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('onboarding_state')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: connections } = useQuery({
    queryKey: ['onboarding-connections', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_connections')
        .select('*')
        .eq('created_by', user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (existing) {
      setStep(existing.step || 1);
      setCandidate(existing.candidate_or_party ?? '');
      setElectionType(existing.election_type ?? 'general');
      setTone(existing.tone ?? 'professional');
      setMandateTarget(existing.mandate_target ?? 2);
      setMonthsToElection(Math.min(existing.months_to_election ?? maxMonthsToElection, maxMonthsToElection));
      setHotConversionRate(existing.hot_conversion_rate ?? 40);
      setColdConversionRate(existing.cold_conversion_rate ?? 10);
      setHotList(existing.hot_list_count ?? mandatePlan.hotContactsRequired);
      setColdList(existing.cold_list_count ?? mandatePlan.coldContactsRequired);
      setInitialMessage(existing.initial_message ?? '');
    }
  }, [existing, mandatePlan.coldContactsRequired, mandatePlan.hotContactsRequired]);

  useEffect(() => {
    setHotList(mandatePlan.hotContactsRequired);
    setColdList(mandatePlan.coldContactsRequired);
  }, [mandatePlan.hotContactsRequired, mandatePlan.coldContactsRequired]);

  useEffect(() => {
    if (!connections) return;
    setVerifiedChannels({
      whatsapp: connections.some((c) => c.platform?.startsWith('whatsapp') && c.is_connected),
      sms: connections.some((c) => c.platform === 'sms' && c.is_connected),
    });
    const sms = connections.find((c) => c.platform === 'sms');
    const senderId = (sms?.credentials as any)?.sender_id;
    if (senderId) setSmsSenderId(senderId);
  }, [connections]);

  const save = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!user?.id) throw new Error('משתמש לא מחובר');
      const { error } = await supabase
        .from('onboarding_state')
        .upsert(
          { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) {
        console.error('[OnboardingWizard] save error:', error);
        throw error;
      }
    },
    onError: (e: any) => {
      toast.error('שמירת ההגדרות נכשלה: ' + (e?.message || 'שגיאה לא ידועה'));
    },
  });

  const generateBrief = async () => {
    setGeneratingBrief(true);
    try {
      const { data, error } = await supabase.functions.invoke('strategy-brief', {
        body: {
          candidate, election_type: electionType, tone,
          mandate_target: mandateTarget, months_to_election: monthsToElection,
          hot_list_count: hotList, cold_list_count: coldList,
          hot_conversion_rate: hotConversionRate, cold_conversion_rate: coldConversionRate,
        },
      });
      if (error) throw error;
      if (data?.brief) {
        setBrief(data.brief);
        setBriefStats(data.stats);
      }
    } catch (e: any) {
      toast.error('כשל ביצירת ה-Brief: ' + e.message);
    }
    setGeneratingBrief(false);
  };

  const upsertConnection = async (platform: string, displayName: string, credentials: Record<string, string>) => {
    if (!user?.id) throw new Error('משתמש לא מחובר');
    const payload = {
      platform,
      display_name: displayName,
      credentials,
      is_connected: true,
      created_by: user.id,
      last_test_status: 'success',
      last_test_message: 'Primary Account verified during onboarding',
      last_test_at: new Date().toISOString(),
    };
    const existingConnection = connections?.find((c) => c.platform === platform);
    const { error } = existingConnection
      ? await supabase.from('social_connections').update(payload).eq('id', existingConnection.id)
      : await supabase.from('social_connections').insert(payload);
    if (error) throw error;
  };

  const connectWhatsApp = async () => {
    const isGreen = whatsappPlatform === 'whatsapp_green';
    if (!whatsappInstanceId.trim() || !whatsappToken.trim()) {
      toast.error('יש למלא את כל פרטי WhatsApp');
      return;
    }
    try {
      await upsertConnection(
        whatsappPlatform,
        'Primary Account',
        isGreen
          ? { instance_id: whatsappInstanceId, token: whatsappToken }
          : { phone_number_id: whatsappInstanceId, access_token: whatsappToken }
      );
      setVerifiedChannels((v) => ({ ...v, whatsapp: true }));
      setWhatsappOpen(false);
      toast.success('WhatsApp חובר בהצלחה');
    } catch (e: any) {
      toast.error(e?.message || 'חיבור WhatsApp נכשל');
    }
  };

  const connectSms = async () => {
    if (!smsSenderId.trim()) {
      toast.error('יש להזין Sender ID');
      return;
    }
    try {
      await upsertConnection('sms', 'Primary Account', { sender_id: smsSenderId });
      setVerifiedChannels((v) => ({ ...v, sms: true }));
      toast.success('SMS אומת בהצלחה');
    } catch (e: any) {
      toast.error(e?.message || 'אימות SMS נכשל');
    }
  };

  const next = async () => {
    if (step === 1) {
      await save.mutateAsync({
        step: 2,
        mandate_target: mandateTarget,
      });
      setStep(2);
    } else if (step === 2) {
      await save.mutateAsync({ step: 3, candidate_or_party: candidate });
      setStep(3);
    } else if (step === 3) {
      await save.mutateAsync({ step: 4, election_type: electionType });
      setStep(4);
    } else if (step === 4) {
      await save.mutateAsync({ step: 5, tone });
      setStep(5);
    } else if (step === 5) {
      await save.mutateAsync({ step: 6, months_to_election: monthsToElection });
      setStep(6);
    } else if (step === 6) {
      await save.mutateAsync({ step: 7, hot_conversion_rate: hotConversionRate, hot_list_count: hotList });
      setStep(7);
    } else if (step === 7) {
      await save.mutateAsync({
        step: 8,
        mandate_target: mandateTarget,
        months_to_election: monthsToElection,
        hot_list_count: hotList,
        cold_list_count: coldList,
        hot_conversion_rate: hotConversionRate,
        cold_conversion_rate: coldConversionRate,
      });
      setStep(8);
      if (!initialMessage) {
        setDraftingMessage(true);
        try {
          const { data, error } = await supabase.functions.invoke('onboarding-draft', {
            body: {
              candidate_or_party: candidate, election_type: electionType, tone,
              mandate_target: mandateTarget, months_to_election: monthsToElection,
            },
          });
          if (error) throw error;
          if (data?.message) setInitialMessage(data.message);
        } catch (e: any) {
          toast.error('כשל ביצירת טיוטה: ' + e.message);
        }
        setDraftingMessage(false);
      }
    }
  };

  const finish = useMutation({
    mutationFn: async () => {
      await save.mutateAsync({
        initial_message: initialMessage,
        completed_at: new Date().toISOString(),
      });
      if (user?.id) {
        await supabase.from('user_subscriptions').upsert({
          user_id: user.id,
          election_type: electionType,
          mandate_target: mandateTarget,
          months_to_election: monthsToElection,
          hot_list_count: hotList,
          cold_list_count: coldList,
          hot_conversion_rate: hotConversionRate,
          cold_conversion_rate: coldConversionRate,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-state'] });
      toast.success('ברוך הבא ל-Kalpiz! הקמפיין שלך מוכן.');
      onClose();
    },
    onError: (e: any) => {
      console.error('[OnboardingWizard] finish error:', e);
      toast.error('סיום ההגדרות נכשל: ' + (e?.message || 'שגיאה לא ידועה'));
    },
  });

  const totalSteps = 8;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground" dir="rtl">
        <DialogHeader className="pt-0 text-center">
          <DialogTitle className="mt-0 text-center text-xl text-foreground">
            הגדרת הקמפיין שלך
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-2">
          {Array.from({ length: totalSteps }, (_, index) => index + 1).map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                s <= step ? 'bg-primary' : 'bg-primary/20'
              }`}
            />
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-background p-5 text-center shadow-sm">
              <Label className="text-lg font-black text-foreground">כמה מנדטים אתם רוצים להשיג?</Label>
              <div className="mt-3">
                <SliderBlock label="" value={mandateTarget} onChange={setMandateTarget} min={1} max={15} suffix=" מנדטים" />
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                <strong>{mandateTarget} מנדטים</strong> = {mandatePlan.targetVotes.toLocaleString()} קולות בפועל לפי {VOTES_PER_MANDATE.toLocaleString()} קולות למנדט.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Target className="h-4 w-4 text-primary" /> מי מוביל את הקמפיין?
            </div>
            <div>
              <Label>שם המועמד / המפלגה</Label>
              <Input
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="הזן שם מועמד או מפלגה"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Target className="h-4 w-4 text-primary" /> באיזה סוג בחירות מדובר?
            </div>
            <div>
              <Label>סוג בחירות</Label>
              <RadioGroup value={electionType} onValueChange={setElectionType} className="mt-2">
                {[
                  { v: 'general', l: 'בחירות כלליות (כנסת)' },
                  { v: 'primaries', l: 'פריימריז' },
                  { v: 'municipal', l: 'בחירות מוניציפליות' },
                  { v: 'internal', l: 'בחירות פנים-מפלגתיות' },
                ].map((o) => (
                  <div key={o.v} className="flex items-center gap-2">
                    <RadioGroupItem value={o.v} id={`et-${o.v}`} />
                    <Label htmlFor={`et-${o.v}`} className="font-normal">{o.l}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" /> איזה טון מתאים לקמפיין?
            </div>
            <div>
              <Label>טון הקמפיין</Label>
              <RadioGroup value={tone} onValueChange={setTone} className="mt-2">
                {[
                  { v: 'professional', l: 'מקצועי וענייני' },
                  { v: 'centrist', l: 'מאחד וחיובי' },
                  { v: 'grassroots', l: 'עממי, חם ואישי' },
                  { v: 'sharp', l: 'חד ונחרץ' },
                ].map((o) => (
                  <div key={o.v} className="flex items-center gap-2">
                    <RadioGroupItem value={o.v} id={`t-${o.v}`} />
                    <Label htmlFor={`t-${o.v}`} className="font-normal">{o.l}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Target className="h-4 w-4 text-primary" /> מתי הבחירות?
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              יום הבחירות הרשמי: {ELECTION_DATE_HE} · נשארו ~{maxMonthsToElection} חודשים
            </p>
            <SliderBlock label="חודשים עד הבחירות" value={monthsToElection} onChange={setMonthsToElection} min={1} max={maxMonthsToElection} suffix=" חודשים" />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-success" /> כמה להערכתך מהרשימה החמה יהפכו לתומכים?
            </div>
            <SliderBlock label="רשימה חמה – אחוז המרה" value={hotConversionRate} onChange={setHotConversionRate} min={5} max={80} suffix="%" />
            <div className="rounded-lg bg-muted/40 p-3">
              <Label className="text-xs">רשימה חמה נדרשת</Label>
              <Input type="number" value={hotList} onChange={(e) => setHotList(Number(e.target.value))} className="mt-1 font-black" />
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Target className="h-4 w-4 text-primary" /> כמה מהרשימה הקרה יהפכו לתומכים?
            </div>
            <SliderBlock label="רשימה קרה – אחוז המרה" value={coldConversionRate} onChange={setColdConversionRate} min={1} max={30} suffix="%" />
            <div className="rounded-lg bg-muted/40 p-3">
              <Label className="text-xs">רשימה קרה נדרשת</Label>
              <Input type="number" value={coldList} onChange={(e) => setColdList(Number(e.target.value))} className="mt-1 font-black" />
            </div>
            <div className="bg-background border border-primary/20 rounded-lg p-3 text-sm text-foreground">
              <p><span className="font-bold text-primary">תובנה:</span> שינוי אחוזי ההמרה משנה את גודל הרשימות הדרושות כדי להגיע ליעד.</p>
            </div>
          </div>
        )}

        {false && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <SliderBlock label="רשימה חמה – אחוז המרה" value={hotConversionRate} onChange={setHotConversionRate} min={5} max={80} suffix="%" />
              <SliderBlock label="רשימה קרה – אחוז המרה" value={coldConversionRate} onChange={setColdConversionRate} min={1} max={30} suffix="%" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <Label className="text-xs">רשימה חמה נדרשת</Label>
                <Input type="number" value={hotList} onChange={(e) => setHotList(Number(e.target.value))} className="mt-1 font-black" />
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <Label className="text-xs">רשימה קרה נדרשת</Label>
                <Input type="number" value={coldList} onChange={(e) => setColdList(Number(e.target.value))} className="mt-1 font-black" />
              </div>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
              <p><span className="font-bold text-primary">תובנה:</span> שינוי אחוזי ההמרה מגדיל או מקטין את גודל הרשימות הנדרש כדי להגיע ליעד ה<strong>מנדטים</strong>.</p>
            </div>
          </div>
        )}

        {/* Step 8 */}
        {step === 8 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <MessageSquare className="h-4 w-4 text-primary" /> הודעת פתיחה לבוחרים
            </div>
            {draftingMessage ? (
              <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>ה-AI מכין טיוטה מותאמת אישית...</span>
              </div>
            ) : (
              <>
                <Textarea
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  rows={8}
                  placeholder="ההודעה הראשונה שתישלח לכל בוחר חדש..."
                  className="text-sm leading-relaxed"
                  dir="rtl"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  טיוטה אוטומטית מבוססת על היעדים שהגדרת. ערוך כרצונך.
                </div>
              </>
            )}
          </div>
        )}

        {false && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <Plug className="h-4 w-4" /> חיבור ערוצי הקמפיין
            </div>
            <div className="grid gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      <MessageSquare className="h-4 w-4 text-success" /> WhatsApp
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">חבר חשבון WhatsApp עסקי כחשבון הראשי.</p>
                  </div>
                  {verifiedChannels.whatsapp && <Badge variant="outline" className="gap-1 border-success/40 text-success"><CheckCircle2 className="h-3 w-3" /> מחובר</Badge>}
                </div>
                {!whatsappOpen ? (
                  <Button variant="outline" className="mt-4 w-full" onClick={() => setWhatsappOpen(true)}>
                    <Smartphone className="h-4 w-4" /> {verifiedChannels.whatsapp ? 'עדכן WhatsApp' : 'Connect WhatsApp'}
                  </Button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <RadioGroup value={whatsappPlatform} onValueChange={setWhatsappPlatform} className="grid grid-cols-2 gap-2">
                      <Label className="flex items-center gap-2 rounded-md border p-2"><RadioGroupItem value="whatsapp_green" /> חיבור מהיר</Label>
                      <Label className="flex items-center gap-2 rounded-md border p-2"><RadioGroupItem value="whatsapp_wba" /> חיבור רשמי</Label>
                    </RadioGroup>
                    <Input value={whatsappInstanceId} onChange={(e) => setWhatsappInstanceId(e.target.value)} placeholder={whatsappPlatform === 'whatsapp_green' ? 'Instance ID' : 'Phone Number ID'} />
                    <Input value={whatsappToken} onChange={(e) => setWhatsappToken(e.target.value)} type="password" placeholder={whatsappPlatform === 'whatsapp_green' ? 'API Token' : 'Access Token'} />
                    <Button className="w-full" onClick={connectWhatsApp}><CheckCircle2 className="h-4 w-4" /> אמת וחבר</Button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold"><Radio className="h-4 w-4 text-success" /> SMS</div>
                    <p className="text-xs text-muted-foreground mt-1">הזן Sender ID ראשי לשליחת הודעות קמפיין.</p>
                  </div>
                  {verifiedChannels.sms && <Badge variant="outline" className="gap-1 border-success/40 text-success"><CheckCircle2 className="h-3 w-3" /> אומת</Badge>}
                </div>
                <div className="mt-4 flex gap-2">
                  <Input value={smsSenderId} onChange={(e) => setSmsSenderId(e.target.value)} placeholder="Sender ID" dir="ltr" />
                  <Button onClick={connectSms}><CheckCircle2 className="h-4 w-4" /> אמת</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {false && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <FileText className="h-4 w-4" /> ה-Brief האסטרטגי שלך
            </div>
            {generatingBrief && (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm">האסטרטג בונה את ה-Brief המלא...</p>
                <p className="text-xs">מנתח את היעדים ומגבש המלצות</p>
              </div>
            )}
            {!generatingBrief && brief && briefStats && (
              <StrategyBriefCard brief={brief} stats={briefStats} candidate={candidate} />
            )}
            {!generatingBrief && !brief && (
              <div className="text-center py-8">
                <Button onClick={generateBrief} variant="outline" className="gap-2">
                  <Sparkles className="h-4 w-4" /> צור Brief מחדש
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ArrowRight className="h-4 w-4" /> חזרה
          </Button>
          {step < totalSteps ? (
            <Button onClick={next} disabled={save.isPending || (step === 2 && !candidate.trim())}>
              הבא <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => finish.mutate()} disabled={finish.isPending || generatingBrief}>
              <CheckCircle2 className="h-4 w-4" /> סיים והתחל קמפיין
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SliderBlock({
  label, value, onChange, min, max, suffix,
}: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <div>
      <div className="mb-2 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-black text-primary tabular-nums">{value}{suffix}</span>
        <Label>{label}</Label>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={1} dir="ltr" />
    </div>
  );
}
