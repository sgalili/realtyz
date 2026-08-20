import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Users, Check, Loader2, RefreshCw, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { useExtensionGroups } from "@/lib/extensionGroupBridge";

const SESSION_CACHE_KEY = "rz-fb-groups-cache";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  connected: boolean;
  source?: "api" | "extension";
  group_url?: string | null;
};

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
};

/**
 * CampaignGroupSelector — group targets come from two sources only:
 *  1. Groups already connected through Ayrshare / previously synced rows.
 *  2. Groups pushed in live by the companion browser extension.
 * Manual entry was removed: the extension owns group discovery.
 */
export const CampaignGroupSelector = ({ selectedIds, onChange, className }: Props) => {
  const [ayrshareGroups, setAyrshareGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const { groups: extGroups, lastSyncAt, refresh } = useExtensionGroups();

  const extensionGroups: FacebookGroup[] = extGroups.map((g) => ({
    group_id: g.group_id,
    group_name: g.group_name,
    group_icon: g.group_icon,
    connected: true,
    source: "extension" as const,
    group_url: g.group_url,
  }));

  const extIds = new Set(extensionGroups.map((g) => g.group_id));
  const groups = [...extensionGroups, ...ayrshareGroups.filter((g) => !extIds.has(g.group_id))];
  const hasVisibleGroups = groups.length > 0;

  const fetchFromAyrshare = async (): Promise<FacebookGroup[]> => {
    const { data, error } = await supabase.functions.invoke("ayrshare-groups-fetch", { body: {} });
    if (error) return [];
    return Array.isArray((data as any)?.groups) ? (data as any).groups : [];
  };

  const fetchSyncedGroups = async (): Promise<FacebookGroup[]> => {
    try {
      const { data, error } = await (supabase as any)
        .from("ayrshare_social_accounts")
        .select("account_ref, account_name, page_name, profile_image_url, platform")
        .in("platform", ["fbg", "facebook_group", "facebookgroup"]);
      if (error) return [];
      return (data ?? [])
        .filter((r: any) => r.account_ref)
        .map((r: any) => ({
          group_id: String(r.account_ref),
          group_name: String(r.page_name || r.account_name || "קבוצה"),
          group_icon: r.profile_image_url || null,
          connected: true,
          source: "api" as const,
        }));
    } catch {
      return [];
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      try {
        const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { ayrshare: FacebookGroup[] };
          if (Array.isArray(parsed?.ayrshare)) {
            setAyrshareGroups(parsed.ayrshare);
            setLoading(false);
            return;
          }
        }
      } catch { /* noop */ }

      let list = await fetchFromAyrshare();
      if (list.length === 0) list = await fetchSyncedGroups();
      setAyrshareGroups(list);
      try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ayrshare: list })); } catch { /* noop */ }
    } catch {
      setAyrshareGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const syncFromExtension = () => {
    refresh();
    toast.info("מבקש קבוצות מהתוסף…");
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
          onClick={syncFromExtension}
          title="סנכרן קבוצות מהתוסף"
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          <RefreshCw className="h-3 w-3" /> סנכרן מהתוסף
        </button>
      </div>

      {loading && !hasVisibleGroups && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קבוצות מחוברות…
        </div>
      )}

      {!loading && !hasVisibleGroups && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          אין קבוצות זמינות. פתח את עמוד הקבוצות שלך בפייסבוק כשתוסף הדפדפן פעיל — הקבוצות יסונכרנו לכאן אוטומטית.
        </div>
      )}

      {extensionGroups.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Puzzle className="h-3 w-3 text-primary" />
          {extensionGroups.length} קבוצות סונכרנו מהתוסף
          {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      )}
          {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}
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
                      <span className="text-[10px] text-muted-foreground">
                        {g.source === "extension" ? "מהתוסף" : "מחובר"}
                      </span>
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
