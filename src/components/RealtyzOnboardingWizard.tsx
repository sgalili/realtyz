import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Link2, Sparkles, Check, ArrowLeft, Upload } from "lucide-react";

const TOTAL_STEPS = 3;

type Progress = {
  id?: string;
  user_id: string;
  step: number;
  is_complete: boolean;
  status: "in_progress" | "finished" | "skipped";
};

export function RealtyzOnboardingWizard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // Step 1 state
  const [propertyTitle, setPropertyTitle] = useState("");
  const [description, setDescription] = useState("");
  const [askingPrice, setAskingPrice] = useState("");

  // Step 3 state
  const [outreachDraft, setOutreachDraft] = useState("");
  const [generating, setGenerating] = useState(false);

  // Resolve session + decide whether to show
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const [{ data: profile }, { data: progress }] = await Promise.all([
        supabase.from("profiles").select("plan_status").eq("id", user.id).maybeSingle(),
        supabase.from("onboarding_progress").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      const isTrial = profile?.plan_status === "trial";
      const finished = progress?.status === "finished" || progress?.is_complete;
      if (isTrial && !finished) {
        setStep(progress?.step ?? 1);
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Lead count to display 100-cap progress
  const { data: leadStats } = useQuery({
    queryKey: ["onboarding-lead-count", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("is_demo", false);
      return { count: count ?? 0 };
    },
    enabled: open,
  });

  const saveProgress = useMutation({
    mutationFn: async (patch: Partial<Progress> & { step: number }) => {
      if (!userId) throw new Error("no user");
      const { error } = await supabase.from("onboarding_progress").upsert(
        { user_id: userId, ...patch },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
  });

  const nextStep = async () => {
    const newStep = Math.min(step + 1, TOTAL_STEPS);
    setStep(newStep);
    await saveProgress.mutateAsync({ step: newStep, is_complete: false, status: "in_progress" });
  };

  const finish = async () => {
    await saveProgress.mutateAsync({
      step: TOTAL_STEPS,
      is_complete: true,
      status: "finished",
    });
    toast.success("ברוכים הבאים ל־Realtyz AI!");
    setOpen(false);
    navigate("/lead-crm");
  };

  const skip = async () => {
    await saveProgress.mutateAsync({ step, is_complete: true, status: "skipped" });
    setOpen(false);
  };

  // ---- Step 1: create first listing ----
  const createListing = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("no user");
      if (!propertyTitle.trim()) throw new Error("נדרש שם נכס");
      const slug = propertyTitle.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0590-\u05FF-]/g, "").slice(0, 60) || `listing-${Date.now()}`;
      const { error } = await supabase.from("listings").insert({
        user_id: userId,
        slug: `${slug}-${Date.now().toString(36)}`,
        candidate_name: propertyTitle, // legacy NOT NULL column
        headline: propertyTitle,
        thesis: description || propertyTitle,
        property_title: propertyTitle,
        description: description || "",
        asking_price: Number(askingPrice) || 0,
        features: [],
        is_published: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("הנכס הראשון נוצר");
      await nextStep();
    },
    onError: (e: any) => toast.error(e?.message || "שגיאה ביצירת נכס"),
  });

  // ---- Step 3: generate AI outreach ----
  const generateOutreach = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          topic: `הודעת פתיחה לליד פוטנציאלי על הנכס: ${propertyTitle || "הנכס שלך"}`,
          platform: "whatsapp",
          tone: "ידידותי ומקצועי",
        },
      });
      if (error) throw error;
      const text = (data as any)?.content || (data as any)?.generated_text || "";
      setOutreachDraft(text || `שלום, רציתי לעדכן אותך על נכס חדש שזמין: ${propertyTitle}. נשמח לתאם סיור.`);
    } catch (e: any) {
      // Fallback template if function unavailable
      setOutreachDraft(`שלום, רציתי לעדכן אותך על נכס חדש שזמין: ${propertyTitle || "[שם הנכס]"}. נשמח לתאם סיור.`);
      toast.message("נוצרה טיוטה בסיסית", { description: "ניתן לערוך לפני שליחה" });
    } finally {
      setGenerating(false);
    }
  };

  const progressPct = useMemo(() => Math.round((step / TOTAL_STEPS) * 100), [step]);
  const leadCount = leadStats?.count ?? 0;
  const leadCapPct = Math.min(100, Math.round((leadCount / 100) * 100));

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && skip()}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-xl">ברוכים הבאים ל־Realtyz AI</DialogTitle>
            <Badge variant="secondary">שלב {step} מתוך {TOTAL_STEPS}</Badge>
          </div>
          <DialogDescription>
            ננחה אותך בשלושה שלבים קצרים להתחלה מהירה.
          </DialogDescription>
          <Progress value={progressPct} className="mt-3" />
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              הקמת תיק נכסים
            </div>
            <p className="text-sm text-muted-foreground">
              צור את הנכס הראשון שלך, או דלג ופתח את היבואן להעלאת קובץ CSV.
            </p>
            <div className="space-y-2">
              <Input placeholder="שם הנכס (למשל: דירת 4 חדרים, רמת גן)"
                value={propertyTitle} onChange={(e) => setPropertyTitle(e.target.value)} />
              <Textarea placeholder="תיאור קצר" rows={3}
                value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input type="number" placeholder="מחיר מבוקש (₪)"
                value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 justify-between pt-2">
              <Button variant="ghost" onClick={() => { setOpen(false); navigate("/massive-importer"); }}>
                <Upload className="ml-1 h-4 w-4" /> יבוא CSV במקום
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={nextStep}>דלג</Button>
                <Button onClick={() => createListing.mutate()} disabled={createListing.isPending || !propertyTitle.trim()}>
                  {createListing.isPending ? "שומר…" : "צור והמשך"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Link2 className="h-4 w-4 text-primary" /> חיבור ערוצים
            </div>
            <p className="text-sm text-muted-foreground">
              חבר את חשבונות ה־Google ו־WhatsApp כדי לאפשר תקשורת אוטומטית עם לידים.
            </p>
            <div className="grid gap-3">
              <Button variant="outline" className="justify-between"
                onClick={() => { setOpen(false); navigate("/api-settings?tab=google"); }}>
                <span>חיבור Google</span><ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="justify-between"
                onClick={() => { setOpen(false); navigate("/api-settings?tab=whatsapp"); }}>
                <span>חיבור WhatsApp</span><ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span>שימוש מסלול ניסיון</span>
                <span className="font-mono">{leadCount}/100 לידים</span>
              </div>
              <Progress value={leadCapPct} />
              <p className="mt-2 text-muted-foreground">
                מסלול הניסיון מוגבל ל־100 לידים. שדרוג מסיר את המגבלה.
              </p>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>חזור</Button>
              <Button onClick={nextStep}>המשך</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> שיגור הודעת AI ראשונה
            </div>
            <p className="text-sm text-muted-foreground">
              הפק טיוטה ראשונה של הודעת פנייה ללידים. תוכל לערוך אותה לפני שליחה.
            </p>
            <Button variant="secondary" onClick={generateOutreach} disabled={generating}>
              {generating ? "מייצר…" : "צור טיוטה עם AI"}
            </Button>
            <Textarea rows={6} value={outreachDraft} onChange={(e) => setOutreachDraft(e.target.value)}
              placeholder="הטיוטה תופיע כאן…" />
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>חזור</Button>
              <Button onClick={finish}>
                <Check className="ml-1 h-4 w-4" /> סיום והתחל
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RealtyzOnboardingWizard;
