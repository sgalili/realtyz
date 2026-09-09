import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, MessageCircle, Upload, Target, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;

type StepDef = {
  key: "whatsapp" | "strategy" | "goal";
  title: string;
  description: string;
  icon: typeof MessageCircle;
};

const STEPS: StepDef[] = [
  {
    key: "whatsapp",
    title: "חיבור WhatsApp",
    description: "חבר את חשבון ה־WhatsApp שלך כדי להתחיל לתקשר עם אנשי קשר באופן אוטומטי.",
    icon: MessageCircle,
  },
  {
    key: "strategy",
    title: "העלאת נתוני אסטרטגיה",
    description: "העלה קובץ אסטרטגיה (CSV/XLSX) כדי שה־AI יכיר את שוק היעד והנכסים שלך.",
    icon: Upload,
  },
  {
    key: "goal",
    title: "הגדרת יעד עסקאות סגורות",
    description: "כמה עסקאות סגורות תרצה להשיג החודש? היעד יוצג בלוח הבקרה.",
    icon: Target,
  },
];

export function RealtyzOnboardingWizard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [goal, setGoal] = useState<string>("5");
  const [saving, setSaving] = useState(false);

  // Decide whether to show
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const finished = progress?.status === "finished" || progress?.is_complete;
      if (finished) return;

      const meta = (progress?.metadata as any) || {};
      setCompletedSteps(meta.completed_steps || {});
      if (meta.closed_deal_goal) setGoal(String(meta.closed_deal_goal));
      setStep(progress?.step ?? 1);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = async (
    nextStep: number,
    nextCompleted: Record<string, boolean>,
    extraMeta: Record<string, any> = {},
    finished = false,
  ) => {
    if (!userId) return;
    const { error } = await supabase.from("onboarding_progress").upsert(
      {
        user_id: userId,
        step: nextStep,
        is_complete: finished,
        status: finished ? "finished" : "in_progress",
        completed_at: finished ? new Date().toISOString() : null,
        metadata: { completed_steps: nextCompleted, ...extraMeta },
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
  };

  const markCompleteAndNext = async (key: StepDef["key"]) => {
    setSaving(true);
    try {
      const nextCompleted = { ...completedSteps, [key]: true };
      const nextStep = Math.min(step + 1, TOTAL_STEPS);
      setCompletedSteps(nextCompleted);
      setStep(nextStep);
      await persist(nextStep, nextCompleted, { closed_deal_goal: Number(goal) || 0 });
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (!userId) { setOpen(false); return; }
    try {
      await supabase.from("onboarding_progress").upsert(
        {
          user_id: userId,
          step,
          is_complete: true,
          status: "skipped",
          metadata: { completed_steps: completedSteps, closed_deal_goal: Number(goal) || 0 },
        },
        { onConflict: "user_id" },
      );
    } catch {}
    setOpen(false);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const nextCompleted = { ...completedSteps, goal: true };
      await persist(TOTAL_STEPS, nextCompleted, { closed_deal_goal: Number(goal) || 0 }, true);
      toast.success("ברוכים הבאים ל־Realtyz AI!");
      setOpen(false);
      navigate("/profile");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בסיום");
    } finally {
      setSaving(false);
    }
  };

  const current = STEPS[step - 1];
  const completedCount = useMemo(
    () => STEPS.filter((s) => completedSteps[s.key]).length,
    [completedSteps],
  );

  if (!open || !current) return null;

  const handlePrimary = async () => {
    if (current.key === "whatsapp") {
      // Mark complete first so progress persists, then route to settings
      await markCompleteAndNext("whatsapp");
    } else if (current.key === "strategy") {
      await markCompleteAndNext("strategy");
    } else {
      await finish();
    }
  };

  const goToWhatsApp = () => {
    setOpen(false);
    navigate("/api-settings?tab=whatsapp");
  };

  const goToImporter = () => {
    setOpen(false);
    navigate("/massive-importer");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && skip()}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">ברוכים הבאים ל־Realtyz AI</DialogTitle>
          <DialogDescription>
            שלושה שלבים קצרים כדי להתחיל בעבודה.
          </DialogDescription>
        </DialogHeader>

        {/* Checkmark progress indicator */}
        <ol className="flex items-center justify-between gap-2 pt-2" aria-label="התקדמות">
          {STEPS.map((s, idx) => {
            const isDone = !!completedSteps[s.key];
            const isCurrent = idx + 1 === step;
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`שלב ${idx + 1}: ${s.title}${isDone ? " — הושלם" : ""}`}
                >
                  {isDone ? (
                    <Check className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <span className="text-sm font-semibold">{idx + 1}</span>
                  )}
                </div>
                <div className="flex flex-col text-right">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isDone || isCurrent ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-1 h-px flex-1",
                      isDone ? "bg-primary" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground text-right">
          הושלמו {completedCount} מתוך {TOTAL_STEPS}
        </p>

        {/* Step body */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <current.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            {current.title}
          </div>
          <p className="text-sm text-muted-foreground">{current.description}</p>

          {current.key === "whatsapp" && (
            <Button variant="outline" className="w-full justify-between" onClick={goToWhatsApp}>
              <span>פתח הגדרות WhatsApp</span>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          {current.key === "strategy" && (
            <Button variant="outline" className="w-full justify-between" onClick={goToImporter}>
              <span>פתח יבואן נתוני אסטרטגיה</span>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          {current.key === "goal" && (
            <div className="space-y-2">
              <label htmlFor="closed-deal-goal" className="text-sm font-medium">
                יעד עסקאות סגורות החודש
              </label>
              <Input
                id="closed-deal-goal"
                type="number"
                min={1}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="לדוגמה: 5"
              />
              <p className="text-xs text-muted-foreground">
                ניתן לעדכן את היעד מאוחר יותר במסך לוח הבקרה.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
          <Button variant="ghost" onClick={skip} disabled={saving}>
            דלג על ההדרכה
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                חזור
              </Button>
            )}
            <Button onClick={handlePrimary} disabled={saving || (current.key === "goal" && !goal)}>
              {current.key === "goal" ? (
                <>
                  <Check className="ml-1 h-4 w-4" aria-hidden="true" />
                  סיום
                </>
              ) : (
                "סמן כהושלם והמשך"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RealtyzOnboardingWizard;
