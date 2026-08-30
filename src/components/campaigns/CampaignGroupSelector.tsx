import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { shortenName } from "@/lib/shortenName";
import { Users, Check, Loader2, Plus, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useActiveWorkspaceOwnerId } from "@/hooks/useWorkspace";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  member_count?: number | null;
  connected: boolean;
  group_url?: string | null;
};

/** Pull the numeric/slug group id out of a facebook.com/groups/... URL. */
function groupIdFromUrl(url: string): string | null {
  const m = url.match(/groups\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

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
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const hasVisibleGroups = groups.length > 0;

  const mapRow = (r: any): FacebookGroup => ({
    group_id: String(r.group_id),
    group_name: String(r.group_name || "קבוצה"),
    group_icon: r.group_icon || null,
    member_count: typeof r.member_count === 'number' ? r.member_count : null,
    group_url: r.group_url || `https://www.facebook.com/groups/${String(r.group_id)}`,
    connected: true,
  });

  /** Graph-imported groups plus manually added ones, de-duplicated by id. */
  const fetchStoredGroups = async (): Promise<FacebookGroup[]> => {
    const byId = new Map<string, FacebookGroup>();

    try {
      const { data } = await (supabase as any)
        .from("fb_user_groups")
        .select("group_id, group_name, group_icon, group_url, member_count, is_selected")
        // Workspace-scoped: every member of this workspace sees the same groups.
        .eq("workspace_owner_id", workspaceOwnerId)
        // Only groups the broker approved in the connections screen are targets.
        .neq("is_selected", false)
        .order("group_name", { ascending: true });
      for (const r of (data ?? []) as any[]) {
        if (!r?.group_id) continue;
        byId.set(String(r.group_id), mapRow(r));
      }
    } catch { /* Graph cache unavailable — manual groups still render */ }

    try {
      const { data } = await (supabase as any)
        .from("custom_user_groups")
        .select("group_name, group_url")
        .eq("platform", "facebook")
        .eq("workspace_owner_id", workspaceOwnerId)
        .order("created_at", { ascending: false });
      for (const r of (data ?? []) as any[]) {
        const id = groupIdFromUrl(String(r?.group_url ?? ""));
        if (!id || byId.has(id)) continue;
        byId.set(id, {
          group_id: id,
          group_name: String(r?.group_name || "קבוצה"),
          group_icon: null,
          member_count: null,
          group_url: String(r?.group_url ?? ""),
          connected: true,
        });
      }
    } catch { /* ignore */ }

    return [...byId.values()];
  };

  const load = async () => {
    if (!workspaceOwnerId) return;
    setLoading(true);
    try {
      setGroups(await fetchStoredGroups());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceOwnerId]);

  const addManualGroup = async () => {
    const name = manualName.trim();
    const url = manualUrl.trim();
    const id = groupIdFromUrl(url);
    if (!name || !id) {
      toast.error("יש להזין שם קבוצה וקישור בפורמט https://www.facebook.com/groups/...");
      return;
    }
    setAddingManual(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = workspaceOwnerId || auth?.user?.id;
      const { error } = await (supabase as any).from("custom_user_groups").insert({
        workspace_owner_id: uid,
        group_name: name,
        group_url: url,
        platform: "facebook",
      });
      if (error) throw error;
      setManualName("");
      setManualUrl("");
      toast.success("הקבוצה נוספה");
      setGroups(await fetchStoredGroups());
    } catch (e: any) {
      toast.error(e?.message || "הוספת הקבוצה נכשלה");
    } finally {
      setAddingManual(false);
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
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-[15px] font-semibold text-foreground">פרסום בקבוצות פייסבוק</span>
        {groups.length > 0 && (
          <span className="text-[14px] text-muted-foreground">({selectedIds.length}/{groups.length})</span>
        )}
      </div>

      {loading && !hasVisibleGroups && (
        <div className="flex items-center justify-center gap-2 py-6 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קבוצות מחוברות…
        </div>
      )}

      {!loading && !hasVisibleGroups && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-[14px] text-muted-foreground">
          {syncNote || 'אין קבוצות זמינות. סנכרן את הקבוצות בעמוד החיבורים, או הוסף קבוצה ידנית.'}
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
            <span className="text-[15px] font-semibold text-foreground flex-1">בחר הכל</span>
            <span className="text-[14px] text-muted-foreground tabular-nums">{selectedIds.length}/{groups.length}</span>
          </label>

          <div
            className="max-h-[45vh] min-h-[160px] overflow-y-auto overscroll-contain divide-y divide-border [-webkit-overflow-scrolling:touch]"
            style={{ touchAction: 'pan-y' }}
          >

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
                    <img src={g.group_icon} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 ps-[3px]">
                    <div className="truncate text-[15px] font-medium text-foreground">{shortenName(g.group_name)}</div>
                    {typeof g.member_count === "number" && g.member_count > 0 && (
                      <div className="text-[13px] text-muted-foreground tabular-nums">
                        {g.member_count.toLocaleString("he-IL")} חברים
                      </div>
                    )}
                  </div>
                  {g.group_url && (
                    <button
                      type="button"
                      title="פתח קבוצה בלשונית חדשה"
                      onClick={(e) => { e.preventDefault(); window.open(g.group_url!, '_blank', 'noopener,noreferrer'); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual add — collapsed by default, below the groups list */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[15px] font-semibold text-foreground"
        >
          <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> הוסף ידנית</span>
          <ChevronDown className={cn("h-4 w-4 transition", manualOpen && "rotate-180")} />
        </button>
        {manualOpen && (
          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="שם קבוצה"
              maxLength={120}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[15px] text-foreground"
            />
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://www.facebook.com/groups/..."
              dir="ltr"
              maxLength={500}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[15px] text-foreground"
            />
            <button
              type="button"
              onClick={addManualGroup}
              disabled={addingManual}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-[15px] font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {addingManual ? "מוסיף…" : "הוסף"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default CampaignGroupSelector;
