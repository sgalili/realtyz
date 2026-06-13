import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mic, Send, Brain, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface SystemRule {
  id: string;
  rule_text: string;
  signal: 'directive' | 'negative' | 'positive';
  source: string;
  actor_role: string;
  is_active: boolean;
  weight: number;
  created_at: string;
}

const SIGNAL_LABEL: Record<string, { label: string; tone: string }> = {
  directive: { label: 'תמיד', tone: 'bg-primary/10 text-primary border-primary/20' },
  negative:  { label: 'אסור', tone: 'bg-destructive/10 text-destructive border-destructive/20' },
  positive:  { label: 'מועדף', tone: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}

export function SystemRulesInput() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['system_intelligence_kb', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_intelligence_kb' as any)
        .select('id, rule_text, signal, source, actor_role, is_active, weight, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SystemRule[];
    },
  });

  const ingest = useMutation({
    mutationFn: async (payload: { text?: string; audio_base64?: string; audio_format?: string }) => {
      const { data, error } = await supabase.functions.invoke('ingest-system-rule', {
        body: { ...payload, source: payload.audio_base64 ? 'whatsapp_voice' : 'kb_ui', role: 'owner' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.captured) {
        toast.success('הכלל נלמד והוטמע');
        setText('');
        qc.invalidateQueries({ queryKey: ['system_intelligence_kb', user?.id] });
      } else {
        toast.message('לא זוהה כלל מובהק, נסה לנסח ברור יותר');
      }
    },
    onError: (e: any) => toast.error(e?.message || 'נכשל ללמוד את הכלל'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('system_intelligence_kb' as any)
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system_intelligence_kb', user?.id] }),
    onError: (e: any) => toast.error(e?.message || 'עדכון נכשל'),
  });

  const removeRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('system_intelligence_kb' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system_intelligence_kb', user?.id] }),
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const b64 = await blobToBase64(blob);
        const fmt = (rec.mimeType || 'audio/webm').includes('mp4') ? 'm4a'
                   : (rec.mimeType || '').includes('ogg') ? 'ogg'
                   : 'webm';
        ingest.mutate({ audio_base64: b64, audio_format: fmt });
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      toast.error('אין גישה למיקרופון');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          חוקי התנהגות לסוכן ה-AI · למידה מתמשכת
        </CardTitle>
        <CardDescription className="text-xs">
          הקלד או הקלט כלל אישי — למשל "מעכשיו תמיד תדגיש חנייה ומעלית בדירות בהרצליה" או "אל תפנה ללקוחות בלשון זכר גנרית". הכלל יוטמע אוטומטית לכל יצירת תוכן, תגובה, צ'אט וקריינות קולית.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='לדוגמה: "מעכשיו תמיד תזכיר את האפשרות לפגישת בוקר", "אל תשלח מחיר לפני שמדברים בטלפון"…'
            className="min-h-[90px] text-sm"
            maxLength={1500}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {recording ? (
              <Button onClick={stopRecording} variant="destructive" size="sm" className="gap-1.5">
                <Square className="h-4 w-4" /> עצור הקלטה
              </Button>
            ) : (
              <Button onClick={startRecording} variant="outline" size="sm" className="gap-1.5" disabled={ingest.isPending}>
                <Mic className="h-4 w-4" /> הקלט הוראה קולית
              </Button>
            )}
            <Button
              onClick={() => ingest.mutate({ text })}
              disabled={!text.trim() || ingest.isPending}
              size="sm"
              className="gap-1.5"
            >
              {ingest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              שמור כלל
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground">כללים פעילים</h4>
            <span className="text-[11px] text-muted-foreground">{rules?.length ?? 0} כללים</span>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען...
            </div>
          ) : !rules || rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">עוד לא הוגדרו כללים. הוסף את הראשון למעלה.</p>
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => {
                const meta = SIGNAL_LABEL[r.signal] ?? SIGNAL_LABEL.directive;
                return (
                  <li
                    key={r.id}
                    className={`rounded-md border p-3 text-sm transition ${r.is_active ? 'bg-card' : 'bg-muted/40 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                          <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                          {r.actor_role === 'owner' && (
                            <Badge variant="outline" className="text-[10px]">בעלים</Badge>
                          )}
                        </div>
                        <p className="text-[13px] leading-relaxed text-foreground">{r.rule_text}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                        />
                        <button
                          aria-label="מחק"
                          onClick={() => removeRule.mutate(r.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemRulesInput;
