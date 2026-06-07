import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Type, Files as FilesIcon, Mic, Loader2, Save, Upload, Square, Trash2, Sparkles, Link2,
} from 'lucide-react';
import { toast } from 'sonner';

type InputMode = 'text' | 'files' | 'voice' | 'link';

const TAG_BY_MODE: Record<InputMode, string> = {
  text: '#Text',
  files: '#Document',
  voice: '#VoiceNote',
  link: '#MediaLink',
};

const fileToDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const getSourceType = (file: File): 'pdf' | 'image' | 'video' | 'audio' | 'text' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'text';
};

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const UniversalKnowledgeInput = () => {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();

  const [mode, setMode] = useState<InputMode>('text');

  // Text
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');

  // Files
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);

  // Voice
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceTitle, setVoiceTitle] = useState('');

  // Link (YouTube / article)
  const [linkUrl, setLinkUrl] = useState('');
  const [linkIngesting, setLinkIngesting] = useState(false);

  const handleSaveLink = async () => {
    if (blockDemoAction('add-knowledge-link')) return;
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) { toast.error('הדבק כתובת תקינה (https://...)'); return; }
    if (!user) { toast.error('יש להתחבר תחילה'); return; }
    setLinkIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('kb-ingest-link', {
        body: { url },
      });
      if (error) throw error;
      const payload = data as { title?: string; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      toast.success(`נוסף למאגר: ${payload?.title ?? url}`);
      setLinkUrl('');
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
      qc.invalidateQueries({ queryKey: ['media-library'] });
    } catch (e) {
      toast.error(`הוספת קישור נכשלה: ${(e as Error).message}`);
    } finally {
      setLinkIngesting(false);
    }
  };

  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    if (tickRef.current) window.clearInterval(tickRef.current);
  }, [recordedUrl]);

  // ─── Saving ───
  const ingest = useMutation({
    mutationFn: async (payload: {
      title: string;
      raw_text?: string;
      file_data_url?: string;
      mime_type?: string;
      source_type: 'pdf' | 'text' | 'whatsapp' | 'image' | 'video' | 'audio';
      tag: string;
    }) => {
      if (!user) throw new Error('יש להתחבר תחילה');
      const { error } = await supabase.functions.invoke('kb-ingest', {
        body: {
          title: payload.title,
          raw_text: payload.raw_text,
          file_data_url: payload.file_data_url,
          mime_type: payload.mime_type,
          source_type: payload.source_type,
          source_metadata: {
            tags: [payload.tag],
            input_mode: mode,
            is_demo: false, // Production-only mode — demo flag retired
            captured_at: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  // ─── Text submit ───
  const handleSaveText = async () => {
    if (blockDemoAction('add-knowledge-text')) return;
    if (!textBody.trim()) { toast.error('יש להזין תוכן'); return; }
    const title = textTitle.trim() || `הערה מהירה · ${new Date().toLocaleString('he-IL')}`;
    try {
      await ingest.mutateAsync({
        title,
        raw_text: textBody.trim(),
        source_type: 'text',
        tag: TAG_BY_MODE.text,
      });
      toast.success('הטקסט נוסף למאגר הידע');
      setTextTitle(''); setTextBody('');
    } catch (e) {
      toast.error(`שמירה נכשלה: ${(e as Error).message}`);
    }
  };

  // ─── Files submit ───
  const onPickFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((f) => {
      const t = f.type;
      const n = f.name.toLowerCase();
      return (
        t === 'application/pdf' ||
        n.endsWith('.pdf') ||
        n.endsWith('.docx') ||
        t.startsWith('image/') ||
        t.startsWith('text/')
      );
    });
    if (accepted.length === 0) { toast.error('פורמט לא נתמך. PDF, DOCX או תמונה.'); return; }
    setPickedFiles(accepted);
  };

  const handleSaveFiles = async () => {
    if (blockDemoAction('add-knowledge-files')) return;
    if (pickedFiles.length === 0) { toast.error('בחר קבצים תחילה'); return; }
    for (const file of pickedFiles) {
      try {
        const sourceType = getSourceType(file);
        const isTextLike = sourceType === 'text' || sourceType === 'pdf';
        if (isTextLike && file.type.startsWith('text/')) {
          await ingest.mutateAsync({
            title: file.name,
            raw_text: await file.text(),
            source_type: 'text',
            tag: TAG_BY_MODE.files,
          });
        } else {
          await ingest.mutateAsync({
            title: file.name,
            file_data_url: await fileToDataUrl(file),
            mime_type: file.type,
            source_type: sourceType,
            tag: TAG_BY_MODE.files,
          });
        }
        toast.success(`נטען: ${file.name}`);
      } catch (e) {
        toast.error(`כשל בטעינת ${file.name}: ${(e as Error).message}`);
      }
    }
    setPickedFiles([]);
  };

  // ─── Voice flow ───
  const startRecording = async () => {
    if (blockDemoAction('record-voice')) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('הדפדפן אינו תומך בהקלטה');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      setDuration(0);
      tickRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('לא ניתן לגשת למיקרופון');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setTranscript('');
    setVoiceTitle('');
    setDuration(0);
  };

  const transcribe = async () => {
    if (!recordedBlob) return;
    setTranscribing(true);
    try {
      const dataUrl = await fileToDataUrl(recordedBlob);
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio_data_url: dataUrl, mime_type: recordedBlob.type, language: 'he' },
      });
      if (error) throw error;
      const text = (data as { text?: string })?.text?.trim() ?? '';
      if (!text) throw new Error('התמלול חזר ריק');
      setTranscript(text);
      toast.success('התמלול הושלם');
    } catch (e) {
      toast.error(`תמלול נכשל: ${(e as Error).message}`);
    } finally {
      setTranscribing(false);
    }
  };

  const handleSaveVoice = async () => {
    if (blockDemoAction('add-knowledge-voice')) return;
    if (!transcript.trim()) { toast.error('בצע תמלול לפני השמירה'); return; }
    const title = voiceTitle.trim() || `הקלטה קולית · ${new Date().toLocaleString('he-IL')}`;
    try {
      await ingest.mutateAsync({
        title,
        raw_text: transcript.trim(),
        source_type: 'audio',
        tag: TAG_BY_MODE.voice,
      });
      toast.success('ההקלטה תומללה ונשמרה');
      discardRecording();
    } catch (e) {
      toast.error(`שמירה נכשלה: ${(e as Error).message}`);
    }
  };

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              הוספת מקור ידע חדש
            </CardTitle>
            <CardDescription>
              טקסט, קובץ או הקלטה קולית — הכל נשמר לאותו מאגר ידע סמנטי.
            </CardDescription>
          </div>
          {isDemoMode && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              מצב דמו
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as InputMode)} dir="rtl">
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            <TabsTrigger value="text" className="gap-2">
              <Type className="h-4 w-4" /> טקסט
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <FilesIcon className="h-4 w-4" /> קבצים
            </TabsTrigger>
            <TabsTrigger value="voice" className="gap-2">
              <Mic className="h-4 w-4" /> הקלטה
            </TabsTrigger>
            <TabsTrigger value="link" className="gap-2">
              <Link2 className="h-4 w-4" /> קישור
            </TabsTrigger>
          </TabsList>

          {/* TEXT */}
          <TabsContent value="text" className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="text-title" className="text-xs">כותרת (אופציונלי)</Label>
              <Input
                id="text-title"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="לדוגמה: סיכום פגישה עם בעל הנכס"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="text-body" className="text-xs">תוכן</Label>
              <Textarea
                id="text-body"
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="הקלד את הטקסט כאן..."
                className="min-h-[160px]"
              />
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] font-mono">{TAG_BY_MODE.text}</Badge>
              <Button onClick={handleSaveText} disabled={ingest.isPending} className="gap-2">
                {ingest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור למאגר
              </Button>
            </div>
          </TabsContent>

          {/* FILES */}
          <TabsContent value="files" className="mt-4 space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onPickFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/*"
                className="hidden"
                onChange={(e) => e.target.files && onPickFiles(e.target.files)}
              />
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">גרור קבצים לכאן או לחץ לבחירה</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, ותמונות</p>
            </div>

            {pickedFiles.length > 0 && (
              <div className="space-y-2">
                {pickedFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 p-2 rounded border bg-muted/30 text-xs">
                    <FilesIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] font-mono">{TAG_BY_MODE.files}</Badge>
              <div className="flex gap-2">
                {pickedFiles.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setPickedFiles([])}>נקה</Button>
                )}
                <Button onClick={handleSaveFiles} disabled={pickedFiles.length === 0 || ingest.isPending} className="gap-2">
                  {ingest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  העלה ושמור
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* VOICE */}
          <TabsContent value="voice" className="mt-4 space-y-3">
            <div className="rounded-lg border p-5 bg-muted/30 flex flex-col items-center text-center gap-3">
              {!recordedBlob ? (
                <>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    aria-label={recording ? 'עצור הקלטה' : 'התחל הקלטה'}
                    className={`h-20 w-20 rounded-full flex items-center justify-center transition-all ${
                      recording
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                        : 'bg-primary text-primary-foreground hover:scale-105'
                    }`}
                  >
                    {recording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
                  </button>
                  <div>
                    <p className="text-sm font-medium">
                      {recording ? 'מקליט...' : 'לחץ להתחלת הקלטה'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {formatDuration(duration)}
                    </p>
                  </div>
                </>
              ) : (
                <div className="w-full space-y-3">
                  <audio src={recordedUrl ?? undefined} controls className="w-full" />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={discardRecording} className="gap-1">
                      <Trash2 className="h-3.5 w-3.5" /> מחק
                    </Button>
                    <Button onClick={transcribe} disabled={transcribing || !!transcript} size="sm" className="gap-1">
                      {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {transcript ? 'תומלל ✓' : 'תמלל'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {transcript && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="voice-title" className="text-xs">כותרת (אופציונלי)</Label>
                  <Input
                    id="voice-title"
                    value={voiceTitle}
                    onChange={(e) => setVoiceTitle(e.target.value)}
                    placeholder="לדוגמה: סיכום שיחה עם לקוח"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-transcript" className="text-xs">תמלול (ניתן לעריכה)</Label>
                  <Textarea
                    id="voice-transcript"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] font-mono">{TAG_BY_MODE.voice}</Badge>
              <Button
                onClick={handleSaveVoice}
                disabled={!transcript.trim() || ingest.isPending}
                className="gap-2"
              >
                {ingest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור למאגר
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default UniversalKnowledgeInput;
