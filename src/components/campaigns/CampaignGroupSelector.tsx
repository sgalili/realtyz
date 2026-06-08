import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Check, Loader2, RefreshCcw, Plus } from "lucide-react";
import { toast } from "sonner";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  connected: boolean;
};

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

/**
 * CampaignGroupSelector — multi-select grid of Facebook Groups linked to the
 * workspace's Ayrshare profile. Lets the broker fan-out a single post to many
 * groups at once. Includes an inline "Connect Groups" CTA that opens the
 * Ayrshare OAuth flow scoped to Facebook Groups (network=fbg), and auto-
 * refreshes the list when the user returns to the tab.
 *
 * NOTE: Meta deprecated the public Groups Graph API, so groups cannot be
 * enumerated automatically from a connected Page. Each group must be linked
 * once through Ayrshare's OAuth flow, after which it auto-syncs.
 */
export const CampaignGroupSelector = ({ selectedIds, onChange, className }: Props) => {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-groups-fetch", { body: {} });
      if (error) throw new Error(error.message || "שגיאת רשת");
      if ((data as any)?.error) throw new Error((data as any).error);
      const list: FacebookGroup[] = Array.isArray((data as any)?.groups) ? (data as any).groups : [];
      setGroups(list);
    } catch (e: any) {
      setError(e?.message ?? "שגיאה בטעינת הקבוצות");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Auto-refresh when the user returns to the tab — after linking a group on
  // Ayrshare in another window, the user comes back and the list refreshes.
  useEffect(() => {
    const onFocus = () => { load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectGroups = async () => {
    setConnecting(true);
    try {
      toast.loading("פותח חיבור קבוצות פייסבוק…", { id: "fbg-connect" });
      const { data, error } = await supabase.functions.invoke("ayrshare-social-link", {
        body: { platform: "fbg" },
      });
      toast.dismiss("fbg-connect");
      if (error) throw new Error(error.message || "יצירת חיבור נכשלה");
      const url = (data as any)?.url;
      if (!url) throw new Error((data as any)?.error || "לא התקבל קישור חיבור מ-Ayrshare");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("חבר את הקבוצות בחלון שנפתח, ואז חזור לכאן — הרשימה תתעדכן אוטומטית");
    } catch (e: any) {
      toast.dismiss("fbg-connect");
      toast.error(e?.message ?? "פתיחת חיבור נכשלה");
    } finally {
      setConnecting(false);
    }
  };

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const allSelected = groups.length > 0 && selectedIds.length === groups.length;
  const toggleAll = () => onChange(allSelected ? [] : groups.map((g) => g.group_id));

  return (
    <div className={cn("rounded-xl border border-border bg-background p-3 space-y-3", className)} dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">פרסום בקבוצות פייסבוק</span>
          {groups.length > 0 && (
            <span className="text-xs text-muted-foreground">({selectedIds.length}/{groups.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {groups.length > 0 && (
            <>
              <button type="button" onClick={toggleAll}
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted">
                {allSelected ? "נקה הכל" : "בחר הכל"}
              </button>
              <button type="button" onClick={connectGroups} disabled={connecting}
                title="חבר קבוצות פייסבוק נוספות"
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
                {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                הוסף קבוצות
              </button>
            </>
          )}
          <button type="button" onClick={load} aria-label="רענן"
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-4 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">עדיין לא חוברו קבוצות פייסבוק</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            פייסבוק לא מאפשרת לשלוף אוטומטית את כל הקבוצות של הדף המקושר.
            לחץ על הכפתור למטה כדי לחבר את הקבוצות שאתה מנהל — בסיום, חזור לכאן והרשימה תתעדכן.
          </p>
          <button type="button" onClick={connectGroups} disabled={connecting}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-60">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            חבר קבוצות פייסבוק
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((g) => {
            const active = selectedIds.includes(g.group_id);
            return (
              <button
                key={g.group_id}
                type="button"
                onClick={() => toggle(g.group_id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 text-right transition",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/40",
                )}>
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}>
                  {active && <Check className="h-3 w-3" />}
                </div>
                {g.group_icon ? (
                  <img src={g.group_icon} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{g.group_name}</div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-muted-foreground">מחובר ומאומת</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignGroupSelector;
