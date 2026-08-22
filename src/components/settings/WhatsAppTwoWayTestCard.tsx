import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, MessageSquare, RadioTower, Send, XCircle } from 'lucide-react';
import { WaTemplatePicker, type WaTemplateSelection } from '@/components/whatsapp/WaTemplatePicker';
import { buildTemplateComponents, useMetaWaTemplates } from '@/hooks/useMetaWaTemplates';


type SendResult = {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  details?: string;
  mode?: 'template' | 'text';
};

type InboundRow = {
  id: string;
  content: string | null;
  created_at: string;
  sender_type: string | null;
  platform: string | null;
};

/** Normalize Israeli / international input to the digits Meta expects. */
function normalizePhone(raw: string): string {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  if (d.length === 9 && d.startsWith('5')) d = `972${d}`;
  return d;
}

export function WhatsAppTwoWayTestCard() {
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'template' | 'text'>('template');
  const [template, setTemplate] = useState<WaTemplateSelection | null>(null);
  const { data: templateDefs } = useMetaWaTemplates();

  const [body, setBody] = useState('בדיקת חיבור WhatsApp מ-Realtyz AI+ ✅ אנא השב/י בהודעה כלשהי כדי לאמת תקשורת דו-כיוונית.');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [listening, setListening] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const normalized = useMemo(() => normalizePhone(phone), [phone]);
  const valid = normalized.length >= 10 && normalized.length <= 15;
  const canSend = mode === 'template' ? !!template?.name : !!body.trim();

  // Live webhook listener: polls for inbound WhatsApp messages since the test send.
  const { data: inbound, isFetching: polling } = useQuery({
    queryKey: ['wa-twoway-inbound', sentAt, normalized],
    enabled: listening && !!sentAt,
    refetchInterval: listening ? 4000 : false,
    queryFn: async (): Promise<InboundRow[]> => {
      let q = supabase
        .from('messages')
        .select('id, content, created_at, sender_type, platform')
        .eq('platform', 'whatsapp')
        .neq('sender_type', 'agent')
        .order('created_at', { ascending: false })
        .limit(5);
      if (sentAt) q = q.gte('created_at', sentAt);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as InboundRow[];
    },
  });

  // Stop listening automatically once a reply lands.
  useEffect(() => {
    if (inbound && inbound.length > 0) setListening(false);
  }, [inbound]);

  const send = async () => {
    setSending(true);
    setResult(null);
    const startedAt = new Date().toISOString();
    try {
      const def = templateDefs?.find(
        (t) => t.name === template?.name && t.language === template?.language,
      );
      const payload =
        mode === 'template'
          ? {
              phone_number: normalized,
              template_id: template!.name,
              template_language: template!.language,
              template_components: buildTemplateComponents(
                def?.body_text ?? '',
                template!.body_params,
              ),
            }
          : { phone_number: normalized, message: body.trim() };


      const { data, error } = await supabase.functions.invoke('send-whatsapp', { body: payload });
      if (error) throw new Error(error.message);
      const res = data as { success?: boolean; message_id?: string | null; error?: string; details?: unknown };
      if (res?.success) {
        setResult({ ok: true, messageId: res.message_id ?? null, mode });
        setSentAt(startedAt);
        setListening(true);
      } else {
        setResult({
          ok: false,
          mode,
          error: res?.error ?? 'שליחה נכשלה מול Meta Cloud API',
          details: res?.details ? JSON.stringify(res.details, null, 2) : undefined,
        });
      }
    } catch (e) {
      setResult({ ok: false, mode, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    } finally {
      setSending(false);
    }
  };

  const replies = inbound ?? [];

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-green-600" />
          בדיקת WhatsApp דו-כיוונית
        </CardTitle>
        <CardDescription>
          שליחת הודעת בדיקה יזומה באמצעות תבנית מאושרת של Meta (Template) והאזנה חיה לתשובה נכנסת דרך ה-Webhook.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">מספר יעד</Label>
            <Input
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0501234567 / 972501234567"
            />
            {phone && (
              <p className="text-[11px] text-muted-foreground" dir="ltr">
                {valid ? `→ ${normalized}` : 'מספר לא תקין'}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">סוג שליחה</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === 'template' ? 'default' : 'outline'}
                className={mode === 'template' ? '' : 'border-blue-200 text-blue-700'}
                onClick={() => setMode('template')}
              >
                תבנית מאושרת
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'text' ? 'default' : 'outline'}
                className={mode === 'text' ? '' : 'border-blue-200 text-blue-700'}
                onClick={() => setMode('text')}
              >
                טקסט חופשי
              </Button>
            </div>
          </div>
        </div>

        {mode === 'template' ? (
          <div className="space-y-2">
            <WaTemplatePicker value={template} onChange={setTemplate} showTokenHint={false} />
            <p className="text-[11px] text-muted-foreground">
              hello_world עובדת רק ממספרי הבדיקה של Meta. מהמספר העסקי שלך יש לשלוח תבנית מאושרת
              משלך, ולמלא את כל המשתנים שלה.
            </p>
          </div>

        ) : (
          <div className="space-y-1">
            <Label className="text-xs">גוף ההודעה</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-2" disabled={sending || !valid || !canSend} onClick={send}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {mode === 'template' ? 'שלח תבנית בדיקה' : 'שלח הודעת בדיקה'}
          </Button>

          <Badge
            variant="outline"
            className={`gap-1 ${listening ? 'border-green-500/50 text-green-600' : 'text-muted-foreground'}`}
          >
            <RadioTower className={`h-3.5 w-3.5 ${listening ? 'animate-pulse' : ''}`} />
            {listening
              ? polling
                ? 'מאזין ל-Webhook…'
                : 'מאזין לתשובה'
              : replies.length
                ? 'תשובה התקבלה'
                : 'האזנה כבויה'}
          </Badge>

          {listening && (
            <Button size="sm" variant="ghost" onClick={() => setListening(false)}>
              עצור האזנה
            </Button>
          )}
        </div>

        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <AlertDescription className="space-y-1 text-[11px] leading-relaxed">
            <p>
              הודעה יזומה (מחוץ לחלון 24 השעות) חייבת להישלח כתבנית מאושרת. טקסט חופשי ייחסם על ידי
              Meta בשגיאה 131047 אם הלקוח לא כתב לך ב-24 השעות האחרונות.
            </p>
            <p>
              אם Meta מחזירה Message ID של הצלחה אך ההודעה לא מתקבלת — יש לוודא שהמספר רשום כ-Test
              Recipient פעיל תחת WhatsApp → API Setup → To בלוח הבקרה של Meta App.
            </p>
          </AlertDescription>
        </Alert>

        {result && (
          <Alert
            variant={result.ok ? 'default' : 'destructive'}
            className={result.ok ? 'border-blue-200 bg-blue-50' : undefined}
          >
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertDescription className="space-y-1 text-xs">
              {result.ok ? (
                <div className="space-y-1">
                  <span>
                    {result.mode === 'template' ? 'התבנית נשלחה בהצלחה' : 'ההודעה נשלחה בהצלחה'}
                    {result.messageId ? ` · Message ID: ${result.messageId}` : ''}
                  </span>
                  <p className="text-[11px] text-blue-800">
                    לא קיבלת את ההודעה בטלפון? ה-ID מעיד רק שהבקשה התקבלה אצל Meta. ודא שמספר היעד
                    מופיע כ-Test Recipient מאומת וששם/שפת התבנית תואמים לתבנית המאושרת.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-medium">{result.error}</div>
                  <p className="text-[11px]">
                    תגובת השגיאה המלאה של Meta API:
                  </p>
                  <pre dir="ltr" className="max-h-48 overflow-auto rounded bg-background/70 p-2 text-[10px]">
                    {result.details ?? 'אין פירוט נוסף מ-Meta'}
                  </pre>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-medium">הודעות נכנסות אחרונות (אימות דו-כיווניות)</p>
          {replies.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              עדיין לא התקבלו תשובות. שלח תבנית בדיקה והשב עליה מהטלפון כדי לוודא שה-Webhook פעיל.
            </p>
          ) : (
            <ul className="space-y-1">
              {replies.map((m) => (
                <li key={m.id} className="rounded-md bg-background/60 px-2 py-1 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('he-IL')} ·{' '}
                  </span>
                  {m.content ?? ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default WhatsAppTwoWayTestCard;
