import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  connected: boolean;
  group_url?: string | null;
};

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

/**
 * CampaignGroupSelector — group targets come from the backend only:
 * `fb_user_groups` (cached Graph API import). "סנכרן קבוצות" re-runs the
 * `fb-groups-import` edge function against the connected Facebook profile.
 */
export const CampaignGroupSelector = ({ selectedIds, onChange, className }: Props) => {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const hasVisibleGroups = groups.length > 0;

  const mapRow = (r: any): FacebookGroup => ({
    group_id: String(r.group_id),
    group_name: String(r.group_name || "קבוצה"),
    group_icon: r.group_icon || null,
    group_url: r.group_url || `https://www.facebook.com/groups/${String(r.group_id)}`,
    connected: true,
  });

  const fetchStoredGroups = async (): Promise<FacebookGroup[]> => {
    try {
      const { data, error } = await (supabase as any)
        .from("fb_user_groups")
        .select("group_id, group_name, group_icon, group_url")
        .order("group_name", { ascending: true });
      if (error) return [];
      return (data ?? []).filter((r: any) => r.group_id).map(mapRow);
    } catch {
      return [];
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setGroups(await fetchStoredGroups());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const syncFromGraph = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fb-groups-import", { body: {} });
      if (error) throw error;
      const returned: FacebookGroup[] = Array.isArray((data as any)?.groups)
        ? (data as any).groups.filter((r: any) => r?.group_id).map(mapRow)
        : [];
      const imported = Number((data as any)?.imported ?? returned.length);
      if (imported > 0) {
        toast.success(`סונכרנו ${imported} קבוצות מפייסבוק`);
      } else if ((data as any)?.error) {
        toast.error(String((data as any).error));
      } else {
        toast.error("לא נמצאו קבוצות בחשבון המחובר");
      }
      // Prefer the stored rows, but fall back to what the function returned
      // (RLS can hide fb_user_groups from the browser session).
      const stored = await fetchStoredGroups();
      setGroups(stored.length > 0 ? stored : returned);
    } catch (e: any) {
      toast.error(e?.message || "סנכרון הקבוצות נכשל");
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const allSelected = groups.length > 0 && selectedIds.length === groups.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
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
        <button
          type="button"
          onClick={syncFromGraph}
          disabled={syncing}
          title="סנכרן קבוצות מפייסבוק"
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {syncing ? "מסנכרן…" : "סנכרן קבוצות"}
        </button>
      </div>

      {(loading || syncing) && !hasVisibleGroups && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קבוצות מחוברות…
        </div>
      )}

      {!loading && !syncing && !hasVisibleGroups && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          אין קבוצות זמינות. חבר את פרופיל הפייסבוק בעמוד החיבורים ולחץ "סנכרן קבוצות".
        </div>
      )}

      {hasVisibleGroups && (
        <div className="rounded-lg border border-border overflow-hidden">
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
                  <input type="checkbox" className="sr-only" checked={active} onChange={() => toggle(g.group_id)} />
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
