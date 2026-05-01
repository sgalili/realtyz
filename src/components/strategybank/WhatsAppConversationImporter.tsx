import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Upload, Loader2, Brain, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { parseWhatsAppChat } from "@/lib/parseWhatsAppChat";

type Phase = "idle" | "parsing" | "embedding" | "learning" | "done";

const phaseLabel: Record<Phase, string> = {
  idle: "Drop a WhatsApp .txt export to begin",
  parsing: "Parsing conversation…",
  embedding: "Embedding turns into vector memory…",
  learning: "Teaching agent memory…",
  done: "Done",
};

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
        toast.error("Please sign in to import conversations");
        return;
      }
      if (blockDemoAction("import-whatsapp-conversation")) return;
      if (!/\.txt$/i.test(file.name)) {
        toast.error("Please upload a WhatsApp .txt export");
        return;
      }

      try {
        setPhase("parsing");
        setProgress(5);
        const raw = await file.text();
        const parsed = parseWhatsAppChat(raw, agentNameOverride ? { agentName: agentNameOverride } : undefined);

        if (parsed.chunks.length === 0) {
          setPhase("idle");
          setProgress(0);
          toast.error("No valid messages found in this file");
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
              },
            },
          });
          if (error) throw error;
          completed += 1;
          setProgress(Math.round((completed / total) * 90) + 5);
        }

        setPhase("learning");
        setProgress(98);
        // Brief pause for visual reassurance while indexes settle.
        await new Promise((r) => setTimeout(r, 500));

        setPhase("done");
        setProgress(100);
        qc.invalidateQueries({ queryKey: ["kb-documents"] });
        toast.success(`Agent memory updated with ${parsed.turns.length} conversation turns.`);
        setTimeout(() => {
          setPhase("idle");
          setProgress(0);
        }, 2000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Import failed: ${msg}`);
        setPhase("idle");
        setProgress(0);
      }
    },
    [user?.id, blockDemoAction, qc, agentNameOverride],
  );

  const busy = phase !== "idle" && phase !== "done";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          WhatsApp Conversation Importer
        </CardTitle>
        <CardDescription>
          Upload a WhatsApp chat export (.txt). The Strategy Bank parses Agent ↔ Prospect turns,
          embeds them for semantic search, and uses them to coach future replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
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
            accept=".txt,text/plain"
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
              <p className="text-sm font-medium">Agent memory updated.</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Drop your WhatsApp .txt export here</p>
              <p className="text-xs text-muted-foreground mt-1">
                Export a chat from WhatsApp → More → Export chat → Without media
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs">
                <Badge variant="outline" className="gap-1">
                  <Brain className="h-3 w-3" /> Tagged: Past Conversation
                </Badge>
                <Badge variant="outline">Source: WhatsApp</Badge>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <label className="font-medium">Agent name (optional override):</label>
          <input
            type="text"
            placeholder="Auto-detect from most active sender"
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
