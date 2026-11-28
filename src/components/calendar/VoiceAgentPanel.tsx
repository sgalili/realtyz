import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Phone, RefreshCw, Loader2, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';
import { getVoiceAgentSettings, inspectVoiceAgentConnection, saveVoiceAgentSettings, syncVoiceAgentSettings } from '@/lib/voiceAgent.functions';
import { startRitaCall } from '@/lib/ritaVoice.functions';
import { boundedVoiceRequest, DEFAULT_AGENT_VOICE, voiceAgentSettingsSchema, type VoiceAgentSettings } from '@/lib/voiceAgentSettings';

const VOICES = [
  { id: DEFAULT_AGENT_VOICE, label: 'ריטה' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah' },
  { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam' },
];
const defaults: VoiceAgentSettings = { availability: 'away', elevenlabs_voice_id: DEFAULT_AGENT_VOICE, language: 'he', elevenlabs_phone_number: '', greeting: '' };
type Row = Awaited<ReturnType<typeof getVoiceAgentSettings>>;
type Connection = Awaited<ReturnType<typeof inspectVoiceAgentConnection>>;
function settingsFrom(row: Row): VoiceAgentSettings {
  return row ? { availability: row.availability === 'available' ? 'available' : 'away', elevenlabs_voice_id: row.elevenlabs_voice_id || DEFAULT_AGENT_VOICE, language: row.language === 'en' ? 'en' : 'he', elevenlabs_phone_number: row.elevenlabs_phone_number || '', greeting: row.greeting || '' } : { ...defaults };
}

export function VoiceAgentPanel() {
  const { user, loading } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const demo = usePublicWorkspace();
  if (demo) return <Card><CardContent className="p-6 text-muted-foreground">הגדרות סוכן הקול זמינות בחשבון רשום בלבד.</CardContent></Card>;
  if (loading) return <Loader2 className="h-4 w-4 animate-spin" aria-label="טוען חשבון" />;
  if (!user) return null;
  return <AccountVoiceAgentPanel key={`${user.id}:${activeWorkspaceId ?? ''}`} />;
}

function AccountVoiceAgentPanel() {
  const loadFn = useServerFn(getVoiceAgentSettings);
  const saveFn = useServerFn(saveVoiceAgentSettings);
  const inspectFn = useServerFn(inspectVoiceAgentConnection);
  const syncFn = useServerFn(syncVoiceAgentSettings);
  const testFn = useServerFn(startRitaCall);
  const alive = useRef(true);
  const locked = useRef(false);
  const [row, setRow] = useState<Row>(null);
  const [draft, setDraft] = useState<VoiceAgentSettings>({ ...defaults });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'save' | 'sync' | 'check' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [confirmPhone, setConfirmPhone] = useState(false);
  const [confirmTest, setConfirmTest] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settingsFrom(row));

  const inspect = async () => {
    const result = await boundedVoiceRequest(inspectFn(), 40000);
    if (alive.current) setConnection(result);
  };
  const load = async () => {
    setLoading(true); setError('');
    try {
      const saved = await boundedVoiceRequest(loadFn(), 25000);
      if (!alive.current) return;
      setLoaded(true);
      setRow(saved); setDraft(settingsFrom(saved));
      void inspect().catch(() => { if (alive.current) setConnection(null); });
    } catch { if (alive.current) setError('לא ניתן לטעון את הגדרות הקול כרגע. אפשר לנסות שוב.'); }
    finally { if (alive.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);

  const run = async (kind: 'save' | 'sync' | 'check', bindPhone = false) => {
    if (locked.current) return;
    locked.current = true; setBusy(kind); setError(''); setConfirmation('');
    try {
      if (kind === 'check') await inspect();
      else {
        const parsed = voiceAgentSettingsSchema.safeParse(draft);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'יש לבדוק את ההגדרות');
        let saved = row;
        if (dirty || !saved) saved = await boundedVoiceRequest(saveFn({ data: parsed.data }), 25000);
        if (!alive.current) return;
        setRow(saved); setDraft(settingsFrom(saved));
        // A database save is not a claim that live telephony is configured.
        setConnection(null);
        if (kind === 'sync') {
          saved = await boundedVoiceRequest(syncFn({ data: { bindPhone } }), 80000);
          if (!alive.current) return;
          setRow(saved); setDraft(settingsFrom(saved));
          await inspect();
        }
        if (alive.current) {
          const message = kind === 'save' ? 'הגדרות הקול נשמרו' : bindPhone ? 'הסוכן סונכרן והמספר שויך' : 'הקול, השפה וברכת הפתיחה סונכרנו';
          setConfirmation(message); toast.success(message);
        }
      }
    } catch (e) {
      if (alive.current) {
        const message = e instanceof Error ? e.message : 'הפעולה לא הושלמה. יש לרענן ולבדוק את המצב.';
        setError(message); toast.error(message);
      }
    } finally { locked.current = false; if (alive.current) setBusy(null); }
  };
  const runTest = async () => {
    if (locked.current) return;
    locked.current = true; setBusy('test'); setError(''); setConfirmation('');
    try {
      await boundedVoiceRequest(testFn({ data: { demo: true, source: 'voice_agent_test', record_call: false } }), 30000);
      if (alive.current) { setConfirmation('שיחת הבדיקה נשלחה למספר המאומת בפרופיל'); toast.success('שיחת הבדיקה נשלחה'); }
    } catch (e) {
      if (alive.current) { const message = e instanceof Error ? e.message : 'שיחת הבדיקה נכשלה'; setError(message); toast.error(message); }
    } finally { locked.current = false; if (alive.current) setBusy(null); }
  };
  const patch = (value: Partial<VoiceAgentSettings>) => setDraft(current => ({ ...current, ...value }));
  if (loading) return <Card><CardContent className="p-6 flex justify-center text-muted-foreground"><Loader2 className="h-4 w-4 ml-2 animate-spin" />טוען…</CardContent></Card>;
  if (!loaded) return <Card><CardContent className="p-6"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>ניסיון נוסף</Button></CardContent></Card>;

  const phoneLabels: Record<string, string> = { unset: 'לא הוגדר מספר', not_imported: 'המספר טרם יובא ל-ElevenLabs', other_agent: 'המספר משויך לסוכן אחר', unassigned: 'המספר נמצא, אך טרם שויך לסוכן', assigned: 'המספר משויך לסוכן', unknown: 'שיוך המספר לא נבדק' };
  return <Card dir="rtl">
    <CardHeader>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" />סוכן קול AI</CardTitle>
        <Badge variant="secondary">ElevenLabs Conversational AI</Badge>
      </div>
      <CardDescription>שיחות ריטה נכנסות ויוצאות דרך ElevenLabs Conversational AI ומספר Twilio המחובר. Vapi נשאר זמין לתהליכים קודמים בלבד.</CardDescription>
      {connection && <p className="text-sm text-muted-foreground break-words" role="status">{connection.message} · {phoneLabels[connection.phoneState]}</p>}
      {connection?.settingsMatch && !dirty && <Badge variant="secondary" className="gap-1 w-fit"><CheckCircle2 className="h-3 w-3" />ההגדרות אומתו אצל הספק</Badge>}
    </CardHeader>
    <CardContent className="space-y-5">
      {confirmation && <p role="status" className="text-sm text-muted-foreground">{confirmation}</p>}
      {error && <div role="alert" className="text-sm text-destructive break-words">{error}<Button variant="ghost" size="sm" onClick={() => void load()} disabled={!!busy}>רענון הגדרות</Button></div>}
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <Label htmlFor="voice-availability">זמינות</Label>
        <div className="flex items-center gap-2"><span className="text-sm">{draft.availability === 'available' ? 'זמין' : 'לא זמין'}</span><Switch id="voice-availability" checked={draft.availability === 'available'} onCheckedChange={v => patch({ availability: v ? 'available' : 'away' })} disabled={!!busy} /></div>
      </div>
      <p className="text-xs text-muted-foreground">הזמינות נשמרת כהעדפה. מענה אנושי תחילה והעברה לסוכן דורשים הגדרת ניתוב טלפוני אצל הספק.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="voice-agent-voice">קול</Label><Input id="voice-agent-voice" dir="ltr" list="voice-agent-voices" value={draft.elevenlabs_voice_id} onChange={e => patch({ elevenlabs_voice_id: e.target.value })} disabled={!!busy} /><datalist id="voice-agent-voices">{VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</datalist></div>
        <div className="space-y-2"><Label htmlFor="voice-agent-language">שפה</Label><Select value={draft.language} onValueChange={v => patch({ language: v === 'en' ? 'en' : 'he' })} disabled={!!busy}><SelectTrigger id="voice-agent-language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="he">עברית</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="voice-agent-phone">מספר טלפון</Label><Input id="voice-agent-phone" dir="ltr" inputMode="tel" value={draft.elevenlabs_phone_number} onChange={e => patch({ elevenlabs_phone_number: e.target.value })} disabled={!!busy} /><p className="text-xs text-muted-foreground">מספר בינלאומי שכבר יובא ל-ElevenLabs. שמירה בלבד אינה משנה את ניתוב השיחות.</p></div>
      <div className="space-y-2"><Label htmlFor="voice-agent-greeting">ברכת פתיחה</Label><Textarea id="voice-agent-greeting" rows={3} placeholder="השאירו ריק לברכת ברירת המחדל של ריטה." value={draft.greeting} onChange={e => patch({ greeting: e.target.value })} disabled={!!busy} /></div>
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">כתובות החיבור של ריטה ל-ElevenLabs</p>
        {([
          ['search-properties', 'כלי search_properties', 'https://toraff.co.il/api/public/rita/search-properties'],
          ['post-call', 'Post-Call Webhook', 'https://toraff.co.il/api/public/rita/post-call'],
          ['conversation-initiation', 'Conversation Initiation Webhook', 'https://toraff.co.il/api/public/rita/conversation-initiation'],
        ] as const).map(([id, label, url]) => <div className="space-y-1" key={id}><Label htmlFor={`rita-${id}`}>{label}</Label><Input id={`rita-${id}`} dir="ltr" readOnly value={url} onFocus={event => event.currentTarget.select()} /></div>)}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
        <p className="text-xs text-muted-foreground">{dirty ? 'יש שינויים שטרם נשמרו' : row?.last_synced_at ? `סונכרן לאחרונה ${new Date(row.last_synced_at).toLocaleString('he-IL')}` : 'ההגדרות טרם סונכרנו לספק'}</p>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="בדיקת חיבור ElevenLabs" title="בדיקת חיבור ElevenLabs" disabled={!!busy} onClick={() => void run('check')}>{busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
          <Button size="icon" variant="outline" aria-label="שמירת הגדרות" title="שמירת הגדרות" disabled={!!busy || (!dirty && !!row)} onClick={() => void run('save')}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button>
          <Button variant="outline" disabled={!!busy || dirty} title={dirty ? 'יש לשמור ולסנכרן לפני שיחת בדיקה' : 'שיחת בדיקה למספר המאומת בפרופיל'} onClick={() => setConfirmTest(true)}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}שיחת בדיקה</Button>
          <Button disabled={!!busy} onClick={() => draft.elevenlabs_phone_number.trim() ? setConfirmPhone(true) : void run('sync')}>{busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}סנכרון לספק</Button>
        </div>
      </div>
      <AlertDialog open={confirmPhone} onOpenChange={setConfirmPhone}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>שיוך המספר לסוכן הקול</AlertDialogTitle><AlertDialogDescription>הסנכרון ישמור את ההגדרות וישייך את המספר לסוכן ב-ElevenLabs. שיחות נכנסות למספר עשויות להיענות בידי הסוכן. מענה אנושי תחילה דורש ניתוב נפרד. מספר שמשויך לסוכן אחר לא יועבר.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-row justify-between"><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction onClick={() => void run('sync', true)}>אישור וסנכרון</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={confirmTest} onOpenChange={setConfirmTest}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>שיחת בדיקה עם ריטה</AlertDialogTitle><AlertDialogDescription>ריטה תחייג כעת למספר המאומת בפרופיל שלך דרך מספר Twilio המחובר. ההקשר יוגדר כהדגמה כללית של TORAFF, ללא לקוח או נכס פרטי.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-row justify-between"><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirmTest(false); void runTest(); }}>אישור וחיוג</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </CardContent>
  </Card>;
}
