import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, Sparkles, Play, Pause, Trash2, AudioWaveform } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export type VoiceSource = 'tts' | 'upload' | 'record';

export interface VoicePayload {
  source: VoiceSource;
  ttsText?: string;
  ttsVoice?: string;
  fileName?: string;
  durationSec: number;
  audioUrl?: string;
}

interface Props {
  value: VoicePayload | null;
  onChange: (payload: VoicePayload | null) => void;
}

const TTS_VOICES = [
  { id: 'sarit', label: 'שרית - נשי, אנרגטי' },
  { id: 'noam', label: 'נועם - גברי, סמכותי' },
  { id: 'maya', label: 'מאיה - נשי, חמים' },
  { id: 'eitan', label: 'איתן - גברי, רגוע' },
];

const estimateTtsDuration = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // ~150 wpm Hebrew TTS
  return Math.max(3, Math.round((words / 150) * 60));
};

export function VoiceComposer({ value, onChange }: Props) {
  const [tab, setTab] = useState<VoiceSource>(value?.source ?? 'tts');
  const [ttsText, setTtsText] = useState(value?.ttsText ?? '');
  const [ttsVoice, setTtsVoice] = useState(value?.ttsVoice ?? 'sarit');
  const [recording, setRecording] = useState(false);
  const [recordedSec, setRecordedSec] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value?.audioUrl ?? null);
  const [previewName, setPreviewName] = useState<string | null>(value?.fileName ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync TTS text changes upward
  useEffect(() => {
    if (tab !== 'tts') return;
    if (!ttsText.trim()) { onChange(null); return; }
    onChange({
      source: 'tts',
      ttsText,
      ttsVoice,
      durationSec: estimateTtsDuration(ttsText),
    });
  }, [tab, ttsText, ttsVoice, onChange]);

  const handleTabChange = (next: string) => {
    setTab(next as VoiceSource);
    onChange(null);
    setPreviewUrl(null);
    setPreviewName(null);
    setRecordedSec(0);
  };

  const handleFile = useCallback((file: File) => {
    if (!/audio\/(mpeg|mp3|wav|x-wav|webm|ogg)/i.test(file.type) && !/\.(mp3|wav)$/i.test(file.name)) {
      toast.error('סוג קובץ לא נתמך. השתמשו ב-MP3 או WAV');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('הקובץ גדול מדי (מקסימום 20MB)');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewName(file.name);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      const dur = Math.max(1, Math.round(audio.duration || 30));
      onChange({ source: 'upload', fileName: file.name, durationSec: dur, audioUrl: url });
      toast.success(`נטען קובץ ${file.name} (${dur} שניות)`);
    };
  }, [onChange]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewName('הקלטה ידנית');
        onChange({ source: 'record', fileName: 'recording.webm', durationSec: recordedSec || 1, audioUrl: url });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordedSec(0);
      tickRef.current = window.setInterval(() => setRecordedSec((s) => s + 1), 1000);
    } catch (err) {
      console.error(err);
      toast.error('לא ניתן לגשת למיקרופון. אשרו הרשאות בדפדפן');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    window.clearInterval(tickRef.current);
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setPreviewName(null);
    setRecordedSec(0);
    onChange(null);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause(); else audioRef.current.play();
  };

  return (
    <div className="space-y-3" dir="rtl">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tts" className="text-xs gap-1">
            <Sparkles className="h-3.5 w-3.5" /> AI טקסט לדיבור
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs gap-1">
            <Upload className="h-3.5 w-3.5" /> העלאת אודיו
          </TabsTrigger>
          <TabsTrigger value="record" className="text-xs gap-1">
            <Mic className="h-3.5 w-3.5" /> הקלטה
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tts" className="space-y-3 pt-3">
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] text-primary">
            <span className="font-semibold">תעריף: 1.00 ₪ לדקה (+15%)</span>
            <span className="text-muted-foreground">קול AI מבוסס טקסט · עיבוד נוירוני בענן</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">בחירת קול AI</Label>
            <Select value={ttsVoice} onValueChange={setTtsVoice}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TTS_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-sm">{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            rows={5}
            maxLength={800}
            placeholder="כתבו את הטקסט שיומר לדיבור AI טבעי..."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>אורך משוער: {estimateTtsDuration(ttsText)} שניות</span>
            <span dir="ltr">{ttsText.length}/800</span>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-3 pt-3">
          <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-[11px] text-success">
            <span className="font-semibold">תעריף מוזל: 0.20 ₪ לדקה (+15%)</span>
            <span className="text-muted-foreground">קול אנושי / מוקלט · ללא יצירת AI</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-8 text-center transition-colors hover:bg-primary/10"
          >
            <Upload className="h-7 w-7 text-primary" />
            <span className="text-sm font-semibold text-foreground">לחצו להעלאת קובץ MP3 / WAV</span>
            <span className="text-xs text-muted-foreground">עד 20MB</span>
          </button>
        </TabsContent>

        <TabsContent value="record" className="space-y-3 pt-3">
          <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-[11px] text-success">
            <span className="font-semibold">תעריף מוזל: 0.20 ₪ לדקה (+15%)</span>
            <span className="text-muted-foreground">הקלטה ישירה · חיוב נשיאה בלבד</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-6">
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform active:scale-95"
                aria-label="עצור הקלטה"
              >
                <span className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" />
                <span className="absolute inset-2 rounded-full bg-destructive/60 animate-pulse" />
                <Square className="relative h-7 w-7 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary-glow hover:scale-105 active:scale-95"
                aria-label="התחל הקלטה"
              >
                <Mic className="h-8 w-8" />
              </button>
            )}
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {recording ? (
                <span className="flex items-center gap-2 text-destructive">
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  מקליט {Math.floor(recordedSec / 60).toString().padStart(2, '0')}:{(recordedSec % 60).toString().padStart(2, '0')}
                </span>
              ) : (
                <span className="text-muted-foreground">לחצו על המיקרופון כדי להתחיל</span>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview pill for upload / record */}
      {previewUrl && tab !== 'tts' && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
          <audio
            ref={audioRef}
            src={previewUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={togglePlay}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <AudioWaveform className="h-4 w-4 text-primary" />
          <span className="flex-1 truncate text-xs text-foreground">{previewName}</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={clearPreview}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
