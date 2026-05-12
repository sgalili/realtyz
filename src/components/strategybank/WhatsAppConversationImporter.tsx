import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import JSZip from "jszip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Upload, Loader2, Brain, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { parseWhatsAppChat } from "@/lib/parseWhatsAppChat";
import { uploadMediaToLibrary, detectMediaKind } from "@/lib/mediaUpload";

type Phase = "idle" | "unzipping" | "media" | "parsing" | "embedding" | "learning" | "done";

const phaseLabel: Record<Phase, string> = {
  idle: "גררו קובץ ייצוא WhatsApp (.txt או .zip עם מדיה)",
  unzipping: "פותח את קובץ ה-ZIP…",
  media: "מעלה מדיה לספריית המדיה…",
  parsing: "מנתח את השיחה…",
  embedding: "מטמיע את התורים בזיכרון וקטורי…",
  learning: "מלמד את זיכרון הסוכן…",
  done: "הסתיים",
};

const MEDIA_EXT_RE = /\.(jpe?g|png|gif|webp|heic|bmp|mp4|mov|m4v|webm|3gp|avi|mkv|mp3|m4a|ogg|opus|wav|aac|pdf|docx?|xlsx?|pptx?)$/i;

export function WhatsAppConversationImporter() {
  const { user } = useAuth();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [agentNameOverride, setAgentNameOverride] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!user?.id) {
        toast.error("יש להתחבר כדי לייבא שיחות");
        return;
      }
      if (blockDemoAction("import-whatsapp-conversation")) return;

      const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
      const isTxt = /\.txt$/i.test(file.name);
      if (!isZip && !isTxt) {
        toast.error("יש להעלות קובץ ייצוא WhatsApp בפורמט .txt או .zip");
        return;
      }

      try {
        let chatText = "";
        let mediaUploaded = 0;

        if (isZip) {
          setPhase("unzipping");
          setProgress(3);
          const zip = await JSZip.loadAsync(file);

          // Locate chat text file (commonly _chat.txt or chat.txt)
          const entries = Object.values(zip.files).filter((e) => !e.dir);
          const chatEntry =
            entries.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ??
            entries.find((e) => /chat.*\.txt$/i.test(e.name)) ??
            entries.find((e) => /\.txt$/i.test(e.name));
          if (chatEntry) chatText = await chatEntry.async("string");

          // Upload all media files
          const mediaEntries = entries.filter(
            (e) => e !== chatEntry && MEDIA_EXT_RE.test(e.name),
          );

          if (mediaEntries.length > 0) {
            setPhase("media");
            for (let i = 0; i < mediaEntries.length; i++) {
              const entry = mediaEntries[i];
              try {
                const blob = await entry.async("blob");
                const baseName = entry.name.split("/").pop() ?? entry.name;
                await uploadMediaToLibrary({
                  userId: user.id,
                  fileName: baseName,
                  data: blob,
                  source: "whatsapp_zip",
                  sourceMetadata: { zip_name: file.name, kind: detectMediaKind(baseName) },
                });
                mediaUploaded += 1;
              } catch (err) {
                console.warn("media upload failed", entry.name, err);
              }
              setProgress(5 + Math.round(((i + 1) / mediaEntries.length) * 35));
            }
          }
        } else {
          chatText = await file.text();
        }

        if (!chatText.trim()) {
          if (mediaUploaded > 0) {
            qc.invalidateQueries({ queryKey: ["media-library"] });
            toast.success(`הועלו ${mediaUploaded} קבצי מדיה לספרייה. לא נמצא קובץ צ'אט.`);
            setPhase("idle");
            setProgress(0);
            return;
          }
          throw new Error("לא נמצא קובץ צ'אט תקף בארכיון");
        }

        setPhase("parsing");
        setProgress(45);
        const parsed = parseWhatsAppChat(
          chatText,
          agentNameOverride ? { agentName: agentNameOverride } : undefined,
        );

        if (parsed.chunks.length === 0) {
          if (mediaUploaded > 0) {
            qc.invalidateQueries({ queryKey: ["media-library"] });
            toast.success(`הועלו ${mediaUploaded} קבצי מדיה. לא נמצאו הודעות תקפות.`);
          } else {
            toast.error("לא נמצאו הודעות תקפות בקובץ");
          }
          setPhase("idle");
          setProgress(0);
          return;
        }

        setPhase("embedding");
        const total = parsed.chunks.length;
        let completed = 0;
        for (const chunk of parsed.chunks) {
          const { error } = await supabase.functions.invoke("kb-ingest", {
            body: {
              title: `${chunk.title} · ${file.name}`,
              raw_text: chunk.text,
              source_type: "whatsapp",
              source_metadata: {
                source: "WhatsApp",
                category: "Past Conversation",
                file_name: file.name,
                agent_name: parsed.agentName,
                participants: parsed.participants,
                turn_count: chunk.turn_count,
                start_date: chunk.start_date,
                end_date: chunk.end_date,
                media_uploaded: mediaUploaded,
              },
            },
          });
          if (error) throw error;
          completed += 1;
          setProgress(50 + Math.round((completed / total) * 45));
        }

        setPhase("learning");
        setProgress(98);
        await new Promise((r) => setTimeout(r, 400));

        setPhase("done");
        setProgress(100);
        qc.invalidateQueries({ queryKey: ["kb-documents"] });
        qc.invalidateQueries({ queryKey: ["media-library"] });
        toast.success(
          `יובאו ${parsed.turns.length} תורי שיחה${
            mediaUploaded > 0 ? ` ו-${mediaUploaded} קבצי מדיה` : ""
          }.`,
        );
        setTimeout(() => {
          setPhase("idle");
          setProgress(0);
        }, 2000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
        toast.error(`הייבוא נכשל: ${msg}`);
        setPhase("idle");
        setProgress(0);
      }
    },
    [user?.id, blockDemoAction, qc, agentNameOverride],
  );

  const busy = phase !== "idle" && phase !== "done";

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          ייבוא שיחות WhatsApp (כולל מדיה)
        </CardTitle>
        <CardDescription>
          העלו ייצוא צ'אט WhatsApp (.txt או .zip). קבצי מדיה מתוך ה-ZIP נשמרים אוטומטית בספריית המדיה
          לשימוש בפוסטים והודעות ישירות.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => !busy && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            busy
              ? "border-border bg-muted/40 cursor-wait"
              : dragging
                ? "border-primary bg-primary/5 cursor-pointer"
                : "border-border hover:border-primary/60 hover:bg-muted/30 cursor-pointer"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.zip,text/plain,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {busy ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-medium">{phaseLabel[phase]}</p>
              <Progress value={progress} className="w-full max-w-sm" />
            </div>
          ) : phase === "done" ? (
            <div className="flex flex-col items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">הייבוא הושלם.</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">גררו לכאן קובץ .txt או .zip של ייצוא WhatsApp</p>
              <p className="text-xs text-muted-foreground mt-1">
                ייצאו צ'אט מ-WhatsApp ← עוד ← ייצוא צ'אט ← <strong>כולל מדיה</strong>
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs flex-wrap">
                <Badge variant="outline" className="gap-1">
                  <Brain className="h-3 w-3" /> שיחה היסטורית
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <ImageIcon className="h-3 w-3" /> מדיה לספרייה
                </Badge>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label className="font-medium">שם סוכן (עקיפה אופציונלית):</label>
          <input
            type="text"
            placeholder="זיהוי אוטומטי מהשולח הפעיל ביותר"
            value={agentNameOverride ?? ""}
            onChange={(e) => setAgentNameOverride(e.target.value || null)}
            className="flex-1 h-8 px-2 rounded-md border border-input bg-background text-sm"
            disabled={busy}
          />
        </div>
      </CardContent>
    </Card>
  );
}
