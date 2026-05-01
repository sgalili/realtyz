import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AiMessageFeedbackProps {
  aiMessage: string;
  surface?: string;
  leadId?: string | null;
  suggestionId?: string | null;
  metadata?: Record<string, unknown>;
  className?: string;
}

type Rating = "up" | "down" | null;

export function AiMessageFeedback({
  aiMessage,
  surface = "deal_room",
  leadId = null,
  suggestionId = null,
  metadata = {},
  className,
}: AiMessageFeedbackProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState<Rating>(null);
  const [submitted, setSubmitted] = useState<Rating>(null);
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  const disabled = !aiMessage?.trim() || !user;

  const submit = async (r: "up" | "down", suggestedCorrection?: string) => {
    if (!user) {
      toast.error("יש להתחבר כדי לשלוח משוב");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("feedback_logs").insert({
        user_id: user.id,
        surface,
        rating: r,
        ai_message: aiMessage,
        suggested_correction: suggestedCorrection?.trim() || null,
        lead_id: leadId,
        suggestion_id: suggestionId,
        metadata: metadata as any,
      });
      if (error) throw error;
      setSubmitted(r);
      if (r === "up") setRating(null);
      toast.success(r === "up" ? "תודה על המשוב החיובי" : "המשוב נשמר");
    } catch (e: any) {
      toast.error("שמירת המשוב נכשלה", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">איך התשובה הזו?</span>
        <Button
          type="button"
          size="sm"
          variant={submitted === "up" ? "default" : "ghost"}
          className="h-7 px-2 gap-1"
          disabled={disabled || saving}
          onClick={() => submit("up")}
          aria-label="תשובה טובה"
          aria-pressed={submitted === "up"}
        >
          {saving && rating === null && submitted !== "down" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : submitted === "up" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ThumbsUp className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={rating === "down" || submitted === "down" ? "secondary" : "ghost"}
          className="h-7 px-2 gap-1"
          disabled={disabled || saving}
          onClick={() => setRating(rating === "down" ? null : "down")}
          aria-label="תשובה לא טובה"
          aria-pressed={rating === "down"}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
        {submitted && (
          <span className="text-[11px] text-muted-foreground">
            המשוב נשמר לצורך בקרת איכות
          </span>
        )}
      </div>

      {rating === "down" && submitted !== "down" && (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2">
          <label htmlFor="ai-feedback-correction" className="text-xs font-medium">
            מה ה-AI היה צריך לומר?
          </label>
          <Textarea
            id="ai-feedback-correction"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            placeholder="כתוב כאן את הניסוח הנכון…"
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRating(null);
                setCorrection("");
              }}
              disabled={saving}
            >
              ביטול
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => submit("down", correction)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ms-1" /> : null}
              שלח משוב
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AiMessageFeedback;
