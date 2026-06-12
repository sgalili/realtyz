import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, Upload, KeyRound, Square, Play, Pause, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "clone" | "voice_id";

export const AddVoiceDialog = ({
  open, onClose, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (v: { id: string; name: string; voice_id: string }) => void;
}) => {
  const [mode, setMode] = useState<Mode>("clone");
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recording
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName(""); setVoiceId(""); setFile(null);
    setRecordedBlob(null); setElapsed(0); setPreviewing(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => reset(), []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        setRecordedBlob(new Blob(chunks, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecRef.current = mr;
      mr.start();
      setRecording(true);
      setElapsed(0);
      setRecordedBlob(null);
      timerRef.current = window.setInterval(() => setElapsed((s) => {
        const next = s + 1;
        if (next >= 60) { stopRecording(); }
        return next;
      }), 1000);
    } catch {
      toast.error("לא ניתן לגשת למיקרופון");
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  const togglePreview = () => {
    if (!recordedBlob) return;
    if (previewing && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPreviewing(false);
      return;
    }
    const a = new Audio(URL.createObjectURL(recordedBlob));
    audioRef.current = a;
    a.onended = () => { setPreviewing(false); audioRef.current = null; };
    a.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false));
  };

  const handleVoiceIdAdd = async () => {
    if (!name.trim() || !voiceId.trim()) return toast.error("מלאו שם ו-Voice ID");
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return toast.error("נא להתחבר");
      const { data, error } = await supabase.from("cloned_voices").upsert({
        user_id: user.id, name: name.trim(), voice_id: voiceId.trim(),
        provider: "elevenlabs", source: "voice_id",
      }, { onConflict: "user_id,voice_id" }).select().single();
      if (error) return toast.error(`שמירה נכשלה: ${error.message}`);
      toast.success("הקול נוסף");
      onAdded({ id: data.id, name: data.name, voice_id: data.voice_id });
      reset(); onClose();
    } finally { setSubmitting(false); }
  };

  const sendClone = async (sample: Blob, filename: string) => {
    if (!name.trim()) return toast.error("מלאו שם לקול");
    setSubmitting(true);
    const tid = toast.loading("משבט קול ב-ElevenLabs…");
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("file", sample, filename);
      const { data, error } = await supabase.functions.invoke("elevenlabs-voice-clone", { body: form });
      toast.dismiss(tid);
      if (error || (data as any)?.error) {
        toast.error(`שיבוט נכשל: ${(data as any)?.error ?? error?.message ?? ""}`);
        return;
      }
      toast.success("הקול שובט ונשמר");
      onAdded({ id: crypto.randomUUID(), name: name.trim(), voice_id: (data as any).voice_id });
      reset(); onClose();
    } catch (e: any) {
      toast.dismiss(tid);
      toast.error(`שיבוט נכשל: ${e?.message ?? "שגיאה"}`);
    } finally { setSubmitting(false); }
  };

  const handleSaveClone = () => {
    if (recordedBlob) return sendClone(recordedBlob, "recording.webm");
    if (file) return sendClone(file, file.name);
    toast.error("הקליטו דוגמה או העלו קובץ קול");
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md p-5" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-[#0f1b3d] text-right">הוספת קול חדש</DialogTitle>
          <DialogDescription className="text-right text-xs">בחרו שיבוט מהיר או חיבור לפי Voice ID של ElevenLabs.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { id: "clone" as Mode, label: "שיבוט מהיר", Icon: Mic },
            { id: "voice_id" as Mode, label: "לפי Voice ID", Icon: KeyRound },
          ].map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setMode(id)}
              className={cn(
                "flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-semibold border transition-colors",
                mode === id ? "bg-[#0f1b3d] text-white border-[#0f1b3d]" : "bg-background text-[#0f1b3d] border-[#0f1b3d]/15 hover:bg-muted/40",
              )}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        <div className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label className="text-right block text-xs font-semibold text-[#0f1b3d]">שם הקול</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: אודי ויטמן" className="text-right h-10 rounded-xl" />
          </div>

          {mode === "clone" && (
            <>
              <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 p-4 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full", recording ? "bg-red-500 animate-pulse" : recordedBlob ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  {recording ? "מקליט… (עד 60 שניות)" : recordedBlob ? "ההקלטה מוכנה" : "קראו טקסט קצר וברור (~30 שניות)"}
                </div>
                <div className="text-3xl font-mono tabular-nums text-[#0f1b3d]" dir="ltr">{mm}:{ss}</div>
                <div className="flex items-center justify-center gap-2">
                  {!recording ? (
                    <Button type="button" onClick={startRecording}
                      className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-10 px-5 rounded-xl">
                      <Mic className="ml-2 h-4 w-4" /> {recordedBlob ? "הקלטה מחדש" : "התחל הקלטה"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={stopRecording} variant="destructive" className="h-10 px-5 rounded-xl">
                      <Square className="ml-2 h-4 w-4" /> עצור
                    </Button>
                  )}
                  {recordedBlob && !recording && (
                    <>
                      <Button type="button" variant="outline" onClick={togglePreview}
                        className="h-10 w-10 p-0 rounded-xl border-[#0f1b3d]/20">
                        {previewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setRecordedBlob(null); setElapsed(0); }}
                        className="h-10 w-10 p-0 rounded-xl border-[#0f1b3d]/20">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <label className="rounded-xl border-2 border-dashed border-[#0f1b3d]/25 bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50">
                <Upload className="h-6 w-6 text-[#0f1b3d]/50" />
                <p className="text-[11px] text-muted-foreground text-center">קובץ אודיו (10-60 שניות) — mp3 / wav / m4a / webm</p>
                <input ref={fileRef} type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                <div className="text-[11px] text-[#0f1b3d] font-medium">{file ? file.name : "בחרו קובץ"}</div>
              </label>

              <Button type="button" onClick={handleSaveClone}
                disabled={submitting || recording || (!recordedBlob && !file)}
                className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 rounded-xl font-semibold">
                {submitting ? "שומר…" : "שמירת קול"}
              </Button>
            </>
          )}

          {mode === "voice_id" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-right block text-xs font-semibold text-[#0f1b3d]">Voice ID של ElevenLabs</Label>
                <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="4eohDAy1kTS18Cnf0HiN" className="text-left h-10 rounded-xl font-mono" dir="ltr" />
              </div>
              <Button onClick={handleVoiceIdAdd} disabled={submitting}
                className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 rounded-xl font-semibold">
                {submitting ? "שומר…" : "שמירת קול"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
