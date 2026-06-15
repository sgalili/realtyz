import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Check, Loader2, Plus } from "lucide-react";
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
 * CampaignGroupSelector — pulls Facebook Groups via the safe backend bypass and
 * never blocks the composer if the provider rejects the request.
 */
export const CampaignGroupSelector = ({ selectedIds, onChange, className }: Props) => {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromAyrshare = async (): Promise<FacebookGroup[]> => {
    const { data: ws } = await supabase
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    const activeKey = (ws as any)?.ayrshare_profile_key ?? null;
    console.log("[FB_GROUPS] fetching via Ayrshare. Active Profile Key:", activeKey);
    const { data, error } = await supabase.functions.invoke("ayrshare-groups-fetch", { body: {} });
    console.log("[FB_GROUPS] ayrshare-groups-fetch response:", { data, error });
    if (error) return [];
    return Array.isArray((data as any)?.groups) ? (data as any).groups : [];
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Try Ayrshare (uses the active workspace profile key)
      let list = await fetchFromAyrshare();
      // 2) Fallback to the Meta direct bypass if Ayrshare returns nothing
      if (list.length === 0) {
        const { data } = await supabase.functions.invoke("facebook-groups-fetch", { body: {} });
        list = Array.isArray((data as any)?.groups) ? (data as any).groups : [];
      }
      setGroups(list);
    } catch (e: any) {
      setGroups([]);
      onChange([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const onFocus = () => { load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetchFacebookGroups = async () => {
    setConnecting(true);
    try {
      const { data: ws } = await supabase
        .from("workspace_social_profile")
        .select("ayrshare_profile_key")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();
      const activeKey = (ws as any)?.ayrshare_profile_key ?? null;
      console.log("[FB_GROUPS] Connect Groups clicked. Active Profile Key:", activeKey);
      toast.loading("מסנכרן קבוצות פייסבוק…", { id: "fbg-connect" });

      // First, try a live pull using the active profile key
      const ayrGroups = await fetchFromAyrshare();
      if (ayrGroups.length > 0) {
        setGroups(ayrGroups);
        toast.dismiss("fbg-connect");
        toast.success(`נטענו ${ayrGroups.length} קבוצות`);
        return;
      }

      // Otherwise, open the OAuth link so the user can authorize FB Groups
      const { data, error } = await supabase.functions.invoke("ayrshare-social-link", {
        body: { platform: "fbg", profileKey: activeKey },
      });
      toast.dismiss("fbg-connect");
      if (error) throw new Error(error.message || "יצירת חיבור נכשלה");
      const url = (data as any)?.url;
      if (!url) throw new Error((data as any)?.error || "לא נמצאו קבוצות מחוברות");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("חבר את הקבוצות בחלון שנפתח, ואז חזור לכאן — הרשימה תתעדכן אוטומטית");
    } catch (e: any) {
      toast.dismiss("fbg-connect");
      console.error("[FB_GROUPS] connect failed", e);
      toast.error(e?.message ?? "פתיחת חיבור נכשלה");
    } finally {
      setConnecting(false);
    }
  };
  const connectGroups = handleFetchFacebookGroups;

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const allSelected = groups.length > 0 && selectedIds.length === groups.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const toggleAll = () => onChange(allSelected ? [] : groups.map((g) => g.group_id));

  return (
    <div className={cn("rounded-xl border border-border bg-background p-3 space-y-3", className)} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">פרסום בקבוצות פייסבוק</span>
          {groups.length > 0 && (
            <span className="text-xs text-muted-foreground">({selectedIds.length}/{groups.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={connectGroups}
          disabled={connecting}
          title="חבר קבוצות פייסבוק נוספות"
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {groups.length > 0 ? "הוסף קבוצות" : "חבר קבוצות"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && groups.length === 0 && !error && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קבוצות מחוברות…
        </div>
      )}


      {/* Checkbox list */}
      {groups.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Select All master row */}
          <label className="flex items-center gap-3 bg-muted/40 px-3 py-2 cursor-pointer border-b border-border">
            <div
              className={cn(
                "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                allSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : someSelected
                    ? "border-primary bg-primary/30 text-primary-foreground"
                    : "border-border bg-background",
              )}
            >
              {allSelected && <Check className="h-3 w-3" />}
              {someSelected && <div className="h-0.5 w-2 bg-primary-foreground rounded" />}
            </div>
            <input type="checkbox" className="sr-only" checked={allSelected} onChange={toggleAll} />
            <span className="text-sm font-semibold text-foreground flex-1">בחר הכל</span>
            <span className="text-xs text-muted-foreground tabular-nums">{selectedIds.length}/{groups.length}</span>
          </label>

          {/* Group rows */}
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {groups.map((g) => {
              const active = selectedIds.includes(g.group_id);
              return (
                <label
                  key={g.group_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 cursor-pointer transition",
                    active ? "bg-primary/5" : "bg-background hover:bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    onChange={() => toggle(g.group_id)}
                  />
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
                      <span className="text-[10px] text-muted-foreground">מחובר</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignGroupSelector;
