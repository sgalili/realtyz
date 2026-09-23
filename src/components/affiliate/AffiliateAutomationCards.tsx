import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAffiliatePreferences } from "@/hooks/useAffiliate";
import { RitaAvatar } from "@/components/RitaAvatar";

/** Automation cards toggled by the robot icon in the page hero (broker view). */
export default function AffiliateAutomationCards() {
  const [visible, setVisible] = useState(false);
  const { preferences, update, isUpdating } = useAffiliatePreferences();

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("realtyz:affiliate-automation-toggle", toggle);
    return () => window.removeEventListener("realtyz:affiliate-automation-toggle", toggle);
  }, []);

  if (!visible) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2" dir="rtl">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RitaAvatar className="h-9 w-9" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">ריטה, הסוכנת האישית</div>
            <div className="text-xs text-muted-foreground">
              {preferences.rita_auto_mode
                ? "מצב אוטומטי: ריטה עונה לכל פנייה, מציגה נכסים ומחממת את הלידים"
                : "מצב ידני: ריטה מכינה תשובה ואתם שולחים"}
            </div>
          </div>
        </div>
        <Switch
          checked={preferences.rita_auto_mode}
          disabled={isUpdating}
          onCheckedChange={(checked) =>
            update({ rita_auto_mode: checked }, { onError: () => toast.error("שמירת מצב ריטה נכשלה") })
          }
          aria-label="הפעלה אוטומטית של ריטה"
        />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">הוספה אוטומטית לפרסום בפייסבוק ובאינסטגרם</div>
          <div className="text-xs text-muted-foreground">נכסים חדשים יתווספו לשיווק באופן אוטומטי</div>
        </div>
        <Switch
          checked={preferences.auto_funnel_enabled}
          disabled={isUpdating}
          onCheckedChange={(checked) =>
            update({ auto_funnel_enabled: checked }, { onError: () => toast.error("שמירת ההגדרה נכשלה") })
          }
          aria-label="הוספה אוטומטית לפרסום"
        />
      </div>
    </div>
  );
}
