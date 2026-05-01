import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Brain,
  Link as LinkIcon,
  Users,
  Rocket,
  Upload,
  CheckCircle2,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTrialStatus, TRIAL_RECORD_CAP } from '@/hooks/useTrialStatus';
import { BrandLogo } from '@/components/social/BrandLogo';
import { cn } from '@/lib/utils';

/**
 * 4-step "Success in 5 minutes" onboarding wizard for new Free Trial users.
 *
 * Flow:
 *   1. Knowledge — upload PDF/DOC into the listing's brain
 *   2. Connections — One-Click connect Google/Meta/LinkedIn (+WBA)
 *   3. Audience — paste/import a small list of leads (max 100 in trial)
 *   4. Launch — generate first welcome message and dispatch via System WBA
 *
 * Persistent across sessions via localStorage (keyed by user.id), and verified
 * against the database so progress survives even if local storage is cleared.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Recipient {
  name: string;
  phone: string;
}

const STEPS = [
  { key: 'knowledge', label: 'מוח הקמפיין', icon: Brain },
  { key: 'connect', label: 'חיבורים', icon: LinkIcon },
  { key: 'audience', label: 'קהל יעד', icon: Users },
  { key: 'launch', label: 'שיגור', icon: Rocket },
] as const;

type StepKey = typeof STEPS[number]['key'];

const ONE_CLICK_PLATFORMS = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
] as const;

const STORAGE_KEY = (uid: string) => `realtyz-trial-wizard-${uid}`;

/** Israeli phone normalizer → 9725XXXXXXXX (digits only). */
function normalizeIsraeliPhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return null;
  let n = digits;
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '972' + n.slice(1);
  if (!n.startsWith('972')) n = '972' + n;
  if (n.length < 11 || n.length > 13) return null;
  return n;
}

export function TrialQuickStartWizard({ open, onClose }: Props) {
  const { user } = useAuth();
  const { isTrial, isTrialExpired, daysRemaining } = useTrialStatus();
  const [step, setStep] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  // Step 1 state
  const [kbFile, setKbFile] = useState<File | null>(null);
  const [kbDoneCount, setKbDoneCount] = useState(0);

  // Step 2 state
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [systemWbaEnabled, setSystemWbaEnabled] = useState(true);

  // Step 3 state
  const [recipientsText, setRecipientsText] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<Recipient[]>([]);
  const [voterCount, setVoterCount] = useState(0);

  // Step 4 state
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchedCount, setLaunchedCount] = useState<number | null>(null);

  // Hydrate persisted step.
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(user.id));
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.step === 'number') setStep(Math.max(0, Math.min(3, data.step)));
        if (typeof data.welcomeMsg === 'string') setWelcomeMsg(data.welcomeMsg);
      }
    } catch { /* noop */ }
  }, [user?.id]);

  // Persist step changes.
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(
        STORAGE_KEY(user.id),
        JSON.stringify({ step, welcomeMsg }),
      );
    } catch { /* noop */ }
  }, [step, welcomeMsg, user?.id]);

  // Verify real progress from DB whenever the wizard opens or step changes.
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancel = false;
    (async () => {
      const [{ count: kbCount }, { data: conns }, { count: vCount }] = await Promise.all([
        supabase.from('knowledge_documents')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase.from('social_connections').select('platform, is_connected, encrypted_session, credentials'),
        supabase.from('leads').select('*', { count: 'exact', head: true }),
      ]);
      if (cancel) return;
      setKbDoneCount(kbCount ?? 0);
      const map: Record<string, boolean> = {};
      (conns ?? []).forEach((c: any) => {
        const live = !!(c.is_connected && c.encrypted_session);
        map[c.platform] = live || !!c.credentials?.manual?.oauth_client_id;
      });
      setConnections(map);
      setVoterCount(vCount ?? 0);
    })();
    return () => { cancel = true; };
  }, [open, user?.id, step]);

  const progressPct = ((step + 1) / STEPS.length) * 100;

  const trialBanner = useMemo(() => {
    if (!isTrial) return null;
    return (
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-md py-1.5 px-3 border border-border/40">
        <Clock className="h-3 w-3" />
        <span>אתה במסלול ניסיון · {daysRemaining} ימים נותרו · מקסימום {TRIAL_RECORD_CAP} רשומות</span>
      </div>
    );
  }, [isTrial, daysRemaining]);

  // ─── Step 1: Knowledge upload ────────────────────────────────────────
  const handleKbUpload = async () => {
    if (!user?.id || !kbFile) return;
    setBusy(true);
    try {
      const path = `${user.id}/${Date.now()}_${kbFile.name}`;
      const { error: upErr } = await supabase.storage
        .from('knowledge-files')
        .upload(path, kbFile);
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke('kb-ingest', {
        body: {
          user_id: user.id,
          file_path: path,
          title: kbFile.name,
          source_type: 'pdf',
        },
      });
      if (error) throw error;
      toast.success('הקובץ הוטמע במוח הקמפיין', {
        description: `${data?.chunk_count ?? 0} מקטעים נוצרו`,
      });
      setKbDoneCount((c) => c + 1);
      setKbFile(null);
    } catch (e: any) {
      toast.error('העלאה נכשלה', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  // ─── Step 2: One-Click connect (delegates to /social-connect deep link) ──
  const launchOneClickConnect = (platform: string) => {
    // Open the social-connect screen with the platform pre-selected. The
    // SocialConnectionsTab handles the actual OAuth popup so the wizard
    // never replaces the main app session.
    const url = `/social-connect?connect=${platform}&returnTo=${encodeURIComponent(
      `${window.location.pathname}?wizard=open`,
    )}`;
    window.open(url, '_blank', 'noopener');
    toast.message('פתיחת חלון חיבור חדש...', {
      description: 'אחרי שתאשר, החיבור יסומן אוטומטית במאסטר',
    });
  };

  const liveConnectionCount = Object.values(connections).filter(Boolean).length;

  // ─── Step 3: Audience parsing ───────────────────────────────────────
  const parseRecipients = (text: string): Recipient[] => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: Recipient[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length === 0) continue;
      let name = '';
      let phoneRaw = '';
      if (parts.length === 1) {
        phoneRaw = parts[0];
      } else {
        name = parts[0];
        phoneRaw = parts[1];
      }
      const phone = normalizeIsraeliPhone(phoneRaw);
      if (!phone) continue;
      out.push({ name: name || 'ליד/ת', phone });
    }
    return out.slice(0, TRIAL_RECORD_CAP);
  };

  useEffect(() => {
    setParsedRecipients(parseRecipients(recipientsText));
  }, [recipientsText]);

  const handleSaveAudience = async () => {
    if (!user?.id || parsedRecipients.length === 0) return;
    setBusy(true);
    try {
      const remaining = Math.max(0, TRIAL_RECORD_CAP - voterCount);
      if (remaining <= 0) {
        toast.error('הגעת למגבלת הניסיון של 100 רשומות');
        return;
      }
      const slice = parsedRecipients.slice(0, remaining);
      const rows = slice.map((r) => ({
        full_name: r.name,
        phone_number: r.phone,
        status: 'cold',
        interest_tag: 'trial-import',
        is_demo: false,
      }));
      const { error } = await (supabase as any).from('leads').insert(rows);
      if (error) {
        if (String(error.message || '').includes('TRIAL_RECORD_LIMIT')) {
          toast.error('מסלול הניסיון מוגבל ל-100 רשומות');
        } else {
          throw error;
        }
        return;
      }
      toast.success(`${slice.length} לידים נוספו לרשימה`);
      setVoterCount((c) => c + slice.length);
      setRecipientsText('');
    } catch (e: any) {
      toast.error('שמירת הקהל נכשלה', { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  // ─── Step 4: Generate + launch ───────────────────────────────────────
  const handleGenerateMessage = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          platform: 'whatsapp',
          topic: 'הודעת היכרות ראשונה ללידים פוטנציאליים בעברית, חמה ואישית, עד 280 תווים, ללא מיתוג חיצוני',
        },
      });
      if (error) throw error;
      const text = data?.generated_text || data?.text || '';
      setWelcomeMsg(text);
      toast.success('הודעת פתיחה נוצרה');
    } catch (e: any) {
      toast.error('יצירת הודעה נכשלה', { description: e?.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleLaunch = async () => {
    if (!user?.id) return;
    if (isTrialExpired) {
      toast.error('תקופת הניסיון הסתיימה. יש לשדרג כדי להמשיך להפיץ קמפיינים');
      return;
    }
    if (!welcomeMsg.trim()) {
      toast.error('יש לכתוב או לייצר הודעה תחילה');
      return;
    }
    setLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('trial-autopilot-dispatch', {
        body: {
          message_body: welcomeMsg,
        },
      });
      if (error) throw error;
      const queued = data?.queued ?? 0;
      setLaunchedCount(queued);
      toast.success(`${queued} הודעות נשלחו לתור Autopilot`, {
        description: 'המערכת תפיץ אותן ברקע עם השהייה של 30-60 שניות בין הודעות',
      });
    } catch (e: any) {
      toast.error('שיגור נכשל', { description: e?.message });
    } finally {
      setLaunching(false);
    }
  };

  // ─── Navigation ───────────────────────────────────────────────────────
  const canAdvance = useMemo(() => {
    const s = STEPS[step].key as StepKey;
    if (s === 'knowledge') return kbDoneCount > 0;
    if (s === 'connect') return liveConnectionCount > 0 || systemWbaEnabled;
    if (s === 'audience') return voterCount > 0;
    return true;
  }, [step, kbDoneCount, liveConnectionCount, systemWbaEnabled, voterCount]);

  const handleSaveAndExit = () => {
    toast.success('התקדמות נשמרה', { description: 'תוכל להמשיך מאותו השלב מאוחר יותר' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl p-0 overflow-hidden gap-0"
        // Prevent the close-on-overlay so users don't lose progress accidentally.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Top progress bar */}
        <div className="px-6 pt-5 pb-3 border-b border-border/40 bg-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold">צ׳אטו עם הקמפיין שלך תוך 5 דקות</h2>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              שלב {step + 1} מתוך {STEPS.length}
            </span>
          </div>
          <Progress value={progressPct} className="h-1" />
          <div className="grid grid-cols-4 gap-1 mt-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const done = i < step;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-1.5 rounded text-[10px] font-medium transition-colors',
                    active
                      ? 'text-primary'
                      : done
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground/50',
                  )}
                  disabled={i > step}
                >
                  <Icon className="h-4 w-4" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {trialBanner}

          {STEPS[step].key === 'knowledge' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">המוח של הקמפיין</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  העלה מסמך אחד (קורות חיים, מצע, נאומים) - ה-AI ילמד את הסגנון, העמדות והעובדות שלך כדי לדבר בקול שלך.
                </p>
              </div>
              <label
                className={cn(
                  'block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  kbFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => setKbFile(e.target.files?.[0] ?? null)}
                />
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                {kbFile ? (
                  <p className="text-sm font-medium">{kbFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">גרור קובץ PDF / DOC / TXT לכאן</p>
                    <p className="text-[11px] text-muted-foreground mt-1">או לחץ למכירה</p>
                  </>
                )}
              </label>
              {kbDoneCount > 0 && (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {kbDoneCount} מסמכים כבר מוטמעים במוח
                </p>
              )}
              <Button
                onClick={handleKbUpload}
                disabled={!kbFile || busy}
                className="w-full sm:w-auto"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הטמע במוח'}
              </Button>
            </div>
          )}

          {STEPS[step].key === 'connect' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">חיבורים</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  חבר ערוץ אחד לפחות בלחיצה אחת. כל החיבורים נשמרים תחת החשבון שלך ואינם משפיעים על הסשן.
                </p>
              </div>

              {/* System WBA toggle */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start gap-2.5">
                  <BrandLogo platform="whatsapp_green" size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">WhatsApp · System WBA Trial</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      100 הודעות חינם דרך מספר המערכת המשותף, ללא מיתוג. אין צורך לחבר חשבון WhatsApp עצמאי.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={systemWbaEnabled}
                    onChange={(e) => setSystemWbaEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {ONE_CLICK_PLATFORMS.map((p) => {
                  const live = connections[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => launchOneClickConnect(p.key)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border p-2.5 text-right transition-colors',
                        live
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border hover:border-primary/40 hover:bg-muted/30',
                      )}
                    >
                      <BrandLogo platform={p.key} size={18} />
                      <span className="text-sm font-medium flex-1">{p.label}</span>
                      {live && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {STEPS[step].key === 'audience' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">קהל יעד</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  הדבק רשימה של לידים: שם וטלפון, מופרדים בפסיק. עד {TRIAL_RECORD_CAP} רשומות בניסיון. כעת יש לך {voterCount}/{TRIAL_RECORD_CAP}.
                </p>
              </div>
              <Textarea
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                placeholder={"דניאל כהן, 0541234567\nשרה לוי, 0521234567\n..."}
                rows={6}
                className="font-mono text-sm"
                dir="ltr"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{parsedRecipients.length} מספרים תקינים זוהו</span>
                <Button
                  size="sm"
                  onClick={handleSaveAudience}
                  disabled={parsedRecipients.length === 0 || busy}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'הוסף לרשימה'}
                </Button>
              </div>
            </div>
          )}

          {STEPS[step].key === 'launch' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">הפצת ההודעה הראשונה</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  ההודעה תישלח דרך מספר המערכת בקצב בטוח (30-60 שניות בין הודעות) ללא מיתוג. תשובות נכנסות יענו אוטומטית ע״י ה-AI ולא ייספרו במכסה.
                </p>
              </div>
              <Textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                placeholder="שלום [שם], רציתי להכיר את עצמי..."
                rows={5}
                dir="rtl"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleGenerateMessage} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'ייצר הודעה ב-AI'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleLaunch}
                  disabled={launching || isTrialExpired || !welcomeMsg.trim()}
                  className="bg-primary"
                >
                  {launching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `שגר ל-${voterCount} לידים`}
                </Button>
              </div>
              {launchedCount !== null && (
                <div className="space-y-3">
                  <p className="text-sm text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    {launchedCount} הודעות נשלחו לתור · ניתן לעקוב במסך ״פעילות חיה״
                  </p>
                  <a
                    href="/upgrade"
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-gradient-to-l from-amber-500/10 to-amber-500/5 px-4 py-2.5 text-sm font-semibold text-amber-600 hover:from-amber-500/15 hover:to-amber-500/10 transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    שדרג ל-VIP Setup ופתח את המערכת לאלפי לידים
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — buttons side-by-side on mobile */}
        <div className="border-t border-border/40 px-6 py-3 flex flex-row gap-2 justify-between bg-card">
          <Button variant="ghost" size="sm" onClick={handleSaveAndExit}>
            שמור והמשך מאוחר יותר
          </Button>
          <div className="flex flex-row gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                חזור
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                disabled={!canAdvance}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              >
                הבא
              </Button>
            ) : (
              <Button size="sm" onClick={onClose} variant="default">
                סיום
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
