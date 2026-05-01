import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Undo2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  messageId: string;
  leadId: string;
  leadName?: string | null;
  leadCity?: string | null;
  leadStage?: string | null;
  /** Called with the freshly-regenerated AI draft so the parent can prefill the composer. */
  onRegenerated: (draft: string) => void;
  /** Called after the original message row is deleted, before regeneration kicks in. */
  onDeleted?: () => void;
}

/**
 * Inline Undo control rendered on the LATEST AI/agent outbound message in a thread.
 * Click → confirm → DELETE the message row, log an audit entry, then ask the
 * `ai-agent` edge function for a fresh draft. The new draft is handed back to
 * the inbox composer for the human to review and send manually — keeping Udi
 * fully in the loop instead of letting the AI silently re-fire.
 */
export default function UndoLastAiMessage({
  messageId,
  leadId,
  leadName,
  leadCity,
  leadStage,
  onRegenerated,
  onDeleted,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // 1) Delete the offending message
      const { error: delErr } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);
      if (delErr) throw delErr;
      onDeleted?.();

      // 2) Audit log → activity feed picks this up
      await (supabase as any).from("interaction_activity_log").insert({
        user_id: user.id,
        thread_key: `lead:${leadId}`,
        platform: "inbox",
        action_type: "ai_message_undo",
        actor_type: "supervisor",
        actor_id: user.id,
        actor_label: "Supervisor",
        content: "המתווך ביטל את ההודעה האחרונה של ה-AI ובקש ניסוח חדש",
        metadata: { deleted_message_id: messageId },
      });

      // 3) Ask AI for a fresh draft
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: {
          mode: "deal_room_reply",
          lead_id: leadId,
          lead_name: leadName,
          context: `Lead stage: ${leadStage ?? "unknown"}. City: ${leadCity ?? "unknown"}. The previous AI draft was rejected by the human agent — produce a clearly different, sharper alternative.`,
          regenerate: true,
        },
      });
      if (error) throw error;
      const reply =
        (data as any)?.reply ||
        (data as any)?.message ||
        (data as any)?.content ||
        "";
      if (!reply) {
        toast.warning("ההודעה נמחקה — לא התקבל ניסוח חדש מהבינה");
      } else {
        onRegenerated(reply);
        toast.success("ההודעה בוטלה וטיוטה חדשה מוכנה לעריכה");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "פעולת הביטול נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="absolute -top-2 -left-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="ביטול ההודעה האחרונה של ה-AI"
          title="בטל ובקש ניסוח חדש"
        >
          {busy ? (
            <Sparkles className="h-3 w-3 animate-pulse" />
          ) : (
            <Undo2 className="h-3 w-3" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>לבטל את ההודעה האחרונה של ה-AI?</AlertDialogTitle>
          <AlertDialogDescription>
            ההודעה תימחק מהשיחה ויירשם תיעוד פעולה. ה-AI ינסח טיוטה חדשה
            שתופיע בשורת ההקלדה — שלח אותה רק כשתאשר.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={busy}>
            בטל ונסח מחדש
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
