import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Check, ChevronLeft, Loader2, Megaphone, Sparkles, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';
import {
  buildGoogleAllAuthUrl,
  clearFlag,
  connectedGoogleServices,
  isFacebookConnected,
  FIRST_TIME_SYNC_KEY,
  GOOGLE_SERVICES_PENDING_KEY,
  readFlag,
} from '@/lib/googleAllOAuth';

const FIRST_SESSION_WINDOW_MS = 30 * 60 * 1000;
const PROGRESS_KEY = 'realtyz-new-user-onboarding-step-v2';

export function FirstTimeSyncDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(() => Number(readFlag(window.localStorage, PROGRESS_KEY) || 0));
  const [googleDone, setGoogleDone] = useState(false);
  const [facebookDone, setFacebookDone] = useState(false);
  const [busy, setBusy] = useState<'google' | 'facebook' | 'save' | null>(null);
  const [settings, setSettings] = useState({ autoPost: true, leadGeneration: true, leadWarming: true, propertyFilter: true });

  const refreshConnections = async () => {
    const [google, facebook] = await Promise.all([connectedGoogleServices(), isFacebookConnected()]);
    setGoogleDone(google.has('gmail') && google.has('google_calendar'));
    setFacebookDone(facebook);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (readFlag(window.localStorage, FIRST_TIME_SYNC_KEY) === '1') return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const pending = readFlag(window.sessionStorage, GOOGLE_SERVICES_PENDING_KEY) === '1';
      const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', auth.user.id).maybeSingle();
      const createdAt = (profile as { created_at?: string } | null)?.created_at ? Date.parse(String((profile as { created_at: string }).created_at)) : NaN;
      if (!pending && !(Number.isFinite(createdAt) && Date.now() - createdAt < FIRST_SESSION_WINDOW_MS)) return;
      await refreshConnections();
      if (!cancelled) setOpen(true);
    })();
    const onFocus = () => { if (!cancelled) void refreshConnections(); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, []);

  const moveTo = (next: number) => {
    setStep(next);
    try { window.localStorage.setItem(PROGRESS_KEY, String(next)); } catch { /* storage disabled */ }
  };

  const finish = () => {
    try {
      window.localStorage.setItem(FIRST_TIME_SYNC_KEY, '1');
      window.localStorage.removeItem(PROGRESS_KEY);
    } catch { /* storage disabled */ }
    clearFlag(window.sessionStorage, GOOGLE_SERVICES_PENDING_KEY);
    setOpen(false);
  };

  const connectGoogle = async () => {
    setBusy('google');
    const url = await buildGoogleAllAuthUrl();
    if (!url) {
      setBusy(null);
      toast.error('חיבור גוגל אינו מוגדר כרגע', { description: 'אפשר לחבר ידנית בעמוד הפרופיל.' });
      return;
    }
    moveTo(2);
    window.location.assign(url);
  };

  const connectFacebook = async () => {
    setBusy('facebook');
    try {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', {
        body: { action: 'start', redirect_uri: oauthRedirectUri(), return_origin: oauthReturnOrigin() },
      });
      if (error || !(data as { auth_url?: string } | null)?.auth_url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      const opened = openOAuthWindow(String((data as { auth_url: string }).auth_url));
      if (!opened) toast.error('הדפדפן חסם את חלון ההתחברות', { description: 'אפשרו חלונות קופצים ונסו שוב.' });
    } catch (error) {
      toast.error('חיבור פייסבוק נכשל', { description: error instanceof Error ? error.message : 'נסו שוב מעמוד הפרופיל.' });
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    setBusy('save');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('ההתחברות פגה');
      const config = {
        auto_post_once_approved: settings.autoPost,
        lead_generation: settings.leadGeneration,
        lead_warming: settings.leadWarming,
        property_filter_enabled: settings.propertyFilter,
      };
      const { data: existing } = await (supabase as any).from('service_toggles').select('id').eq('service_key', 'onboarding_automations').maybeSingle();
      const query = existing?.id
        ? (supabase as any).from('service_toggles').update({ enabled: true, config }).eq('id', existing.id)
        : (supabase as any).from('service_toggles').insert({ user_id: auth.user.id, service_key: 'onboarding_automations', enabled: true, config });
      const { error } = await query;
      if (error) throw error;
      await (supabase as any).from('affiliate_profiles').update({ rita_auto_mode: settings.leadWarming, auto_funnel_enabled: settings.propertyFilter }).eq('user_id', auth.user.id);
      toast.success('ההגדרות נשמרו');
      finish();
    } catch (error) {
      toast.error('שמירת ההגדרות נכשלה', { description: error instanceof Error ? error.message : 'נסו שוב.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) finish(); }}>
      <DialogContent dir="rtl" className="max-w-lg text-right">
        <div className="flex justify-center gap-1" aria-label={`שלב ${step + 1} מתוך 4`}>
          {[0, 1, 2, 3].map((item) => <span key={item} className={`h-1.5 w-10 rounded-full ${item <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>

        {step === 0 && <>
          <DialogHeader className="text-right">
            <DialogTitle>השותף החכם שלכם לנדל״ן</DialogTitle>
            <DialogDescription>Realtyz מחברת אתכם לנכסים, אנשי קשר ותגמולים — וריטה ממשיכה את העבודה עבורכם.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [Megaphone, 'שיווק אוטומטי', 'פרסום נכסים בערוצים המחוברים.'],
              [Users, 'יצירת אנשי קשר', 'קליטת פניות ומעקב במקום אחד.'],
              [Sparkles, 'ריטה מחממת', 'מענה, סינון והתאמת נכסים בזמן אמת.'],
            ].map(([Icon, title, text]) => <div key={String(title)} className="rounded-xl border bg-card p-4 text-center"><Icon className="mx-auto mb-2 h-6 w-6 text-primary" /><div className="font-semibold">{String(title)}</div><p className="mt-1 text-xs text-muted-foreground">{String(text)}</p></div>)}
          </div>
          <Button className="w-full" onClick={() => moveTo(1)}>מתחילים <ChevronLeft className="h-4 w-4" /></Button>
        </>}

        {step === 1 && <>
          <DialogHeader className="text-right"><DialogTitle>חיבור פייסבוק</DialogTitle><DialogDescription>חברו עמוד פייסבוק כדי לפרסם, לקבל תגובות ולעקוב אחר קמפיינים.</DialogDescription></DialogHeader>
          <Button className="w-full justify-between" variant="outline" disabled={busy !== null || facebookDone} onClick={connectFacebook}>
            <span>{facebookDone ? 'פייסבוק מחובר' : 'חיבור חשבון פייסבוק'}</span>{facebookDone ? <Check className="h-4 w-4 text-emerald-600" /> : busy === 'facebook' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </Button>
          <Button className="w-full" onClick={() => moveTo(2)}>{facebookDone ? 'המשך' : 'אחבר אחר כך'} <ChevronLeft className="h-4 w-4" /></Button>
        </>}

        {step === 2 && <>
          <DialogHeader className="text-right"><DialogTitle>חיבור Gmail ו-Google Calendar</DialogTitle><DialogDescription>אישור אחד מאפשר לשמור שיחות, פגישות ותזכורות ביומן ולשלוח הודעות מהחשבון שלכם.</DialogDescription></DialogHeader>
          <Button className="w-full justify-between" variant="outline" disabled={busy !== null || googleDone} onClick={connectGoogle}>
            <span>{googleDone ? 'Gmail ויומן Google מחוברים' : 'חיבור חשבון Google'}</span>{googleDone ? <Check className="h-4 w-4 text-emerald-600" /> : busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </Button>
          <Button className="w-full" onClick={() => moveTo(3)}>{googleDone ? 'המשך' : 'אחבר אחר כך'} <ChevronLeft className="h-4 w-4" /></Button>
        </>}

        {step === 3 && <>
          <DialogHeader className="text-right"><DialogTitle>הגדירו את האוטומציה</DialogTitle><DialogDescription>אפשר לשנות כל הגדרה בהמשך. פרסום אוטומטי מתבצע רק בהתאם לאישורים שלכם.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {([
              ['autoPost', 'פרסום אוטומטי', 'פרסום תוכן שאושר בערוצים המחוברים'],
              ['leadGeneration', 'יצירת אנשי קשר', 'קליטת פניות מפוסטים וקמפיינים'],
              ['leadWarming', 'חימום אנשי קשר', 'ריטה ממשיכה שיחה ומקדמת להתאמה'],
              ['propertyFilter', 'סינון נכסים', 'הכנסת נכסים מתאימים למשפך בלבד'],
            ] as const).map(([key, title, description]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={settings[key]} onCheckedChange={(checked) => setSettings((current) => ({ ...current, [key]: checked }))} /></div>)}
          </div>
          <Button className="w-full" disabled={busy !== null} onClick={() => void saveSettings()}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} שמירה וכניסה למערכת</Button>
        </>}
      </DialogContent>
    </Dialog>
  );
}

export default FirstTimeSyncDialog;