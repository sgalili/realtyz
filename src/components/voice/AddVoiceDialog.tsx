import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, Upload, KeyRound } from "lucide-react";
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
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setName(""); setVoiceId(""); setFile(null); };

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

  const handleClone = async () => {
    if (!name.trim() || !file) return toast.error("מלאו שם והעלו קובץ קול");
    setSubmitting(true);
    const tid = toast.loading("משבט קול ב-ElevenLabs…");
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("file", file);
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md p-5" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-[#0f1b3d] text-right">הוספת קול חדש</DialogTitle>
          <DialogDescription className="text-right text-xs">בחרו שיבוט מהיר או חיבור לפי Voice ID של ElevenLabs.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mt-2">
          {[
            { id: "clone" as Mode, label: "שיבוט מהיר", Icon: Mic },
            { id: "voice_id" as Mode, label: "לפי Voice ID", Icon: KeyRound },
          ].map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setMode(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold border transition-colors",
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

          {mode === "clone" ? (
            <label className="rounded-xl border-2 border-dashed border-[#0f1b3d]/25 bg-muted/30 p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50">
              <Upload className="h-6 w-6 text-[#0f1b3d]/50" />
              <p className="text-[11px] text-muted-foreground text-center">קובץ אודיו (10-60 שניות) — mp3 / wav / m4a / webm</p>
              <input ref={fileRef} type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
              <div className="text-[11px] text-[#0f1b3d] font-medium">{file ? file.name : "בחרו קובץ"}</div>
            </label>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-right block text-xs font-semibold text-[#0f1b3d]">Voice ID של ElevenLabs</Label>
              <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="4eohDAy1kTS18Cnf0HiN" className="text-left h-10 rounded-xl font-mono" dir="ltr" />
            </div>
          )}

          <Button onClick={mode === "clone" ? handleClone : handleVoiceIdAdd}
            disabled={submitting}
            className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 rounded-xl font-semibold">
            {submitting ? "שומר…" : "שמירת קול"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
