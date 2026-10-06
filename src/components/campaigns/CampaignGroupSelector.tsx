import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { shortenName } from "@/lib/shortenName";
import { openExternal } from "@/lib/openExternal";
import { fbGroupId, fbGroupUrl, fbGroupUrlFrom } from "@/lib/fbGroupUrl";
import { Users, Check, Loader2, Plus, ExternalLink, ChevronDown, List } from "lucide-react";
import { toast } from "sonner";
import { useActiveWorkspaceOwnerId } from "@/hooks/useWorkspace";
import { useMetaPageBinding } from "@/hooks/useMetaPageBinding";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  member_count?: number | null;
  connected: boolean;
  group_url?: string | null;
};

/** Pull the numeric/slug group id out of a facebook.com/groups/... URL. */
const groupIdFromUrl = (url: string): string | null => fbGroupId(url);

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
  const { data: pageBinding } = useMetaPageBinding();
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

  const hasVisibleGroups = groups.length > 0;

  const mapRow = (r: any): FacebookGroup => ({
    group_id: String(r.group_id),
    group_name: String(r.group_name || "קבוצה"),
    group_icon: r.group_icon || null,
    member_count: typeof r.member_count === 'number' ? r.member_count : null,
    group_url: fbGroupUrlFrom(r.group_url, String(r.group_id)),
    connected: true,
  });

  /** Graph-imported groups plus manually added ones, de-duplicated by id. */
  const fetchStoredGroups = async (): Promise<FacebookGroup[]> => {
    const byId = new Map<string, FacebookGroup>();
    const blocked = new Set<string>();

    try {
      const { data } = await (supabase as any)
        .from("fb_user_groups")
        .select("group_id, group_name, group_icon, group_url, member_count, is_selected, page_id, is_blocked")
        // Workspace-scoped: every member of this workspace sees the same groups.
        .eq("workspace_owner_id", workspaceOwnerId)
        // Only groups the broker approved in the connections screen are targets.
        .neq("is_selected", false)
        .order("group_name", { ascending: true });
      // TENANT ISOLATION: skip groups bound to a Facebook page this workspace
      // is not connected to.
      const connectedPage = pageBinding?.pageId ?? null;
      for (const r of (data ?? []) as any[]) {
        if (!r?.group_id) continue;
        // Blocked/restricted groups are never offered as campaign targets.
        if (r.is_blocked) { blocked.add(String(r.group_id).replace(/^(ext:|manual:)/, '')); continue; }
        if (r.page_id && connectedPage && String(r.page_id) !== connectedPage) continue;
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
        if (!id || byId.has(id) || blocked.has(id)) continue;
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
        group_url: fbGroupUrl(url) ?? url,
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

  // Compare by normalized bare id: drafts and repost prefills store ids
  // without the `ext:` prefix / URL form that fb_user_groups rows may carry.
  const bare = (id: string) => fbGroupId(id) ?? id.replace(/^(ext:|manual:)/, '');
  const selection = useMemo(() => Array.isArray(selectedIds)
    ? [...new Map(selectedIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => [bare(id), id])).values()]
    : [], [selectedIds]);
  const selectedKeys = useMemo(() => new Set(selection.map(bare)), [selection]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const isSelected = (g: FacebookGroup) => selectedKeys.has(bare(g.group_id));
  const commitSelection = (next: string[]) => {
    if (next.length === selectionRef.current.length && next.every((id, i) => id === selectionRef.current[i])) return;
    selectionRef.current = next;
    onChange(next);
  };
  const toggle = (id: string) => {
    if (loading || !id || !groups.some((g) => bare(g.group_id) === bare(id))) return;
    const current = selectionRef.current;
    const target = bare(id);
    commitSelection(current.some((x) => bare(x) === target)
      ? current.filter((x) => bare(x) !== target)
      : [...current, id]);
  };
  const allSelected = groups.length > 0 && groups.every(isSelected);
  const someSelected = groups.some(isSelected) && !allSelected;
  const toggleAll = () => {
    if (loading || !groups.length) return;
    const keys = new Set(selectionRef.current.map(bare));
    commitSelection(groups.every((g) => keys.has(bare(g.group_id)))
      ? [] : [...new Map(groups.map((g) => [bare(g.group_id), g.group_id])).values()]);
  };

  return (
    <div className={cn("w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-background p-3 space-y-3", className)} dir="rtl">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 break-words text-[15px] font-semibold text-foreground">פרסום בקבוצות פייסבוק</span>
        {groups.length > 0 && (
          <span className="text-[14px] text-muted-foreground">({selection.length}/{groups.length})</span>
        )}
        {groups.length > 0 && (
          <button
            type="button"
            aria-label="בחירה מרובה"
            aria-pressed={selectMode}
            onClick={() => setSelectMode((v) => !v)}
            className={cn("ms-auto shrink-0 rounded-md p-1.5 transition", selectMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            <List className="h-4 w-4" />
          </button>
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
        <div className="min-w-0 max-w-full rounded-lg border border-border overflow-hidden">
          {selectMode && <Button type="button" variant="ghost" role="checkbox" aria-checked={someSelected ? 'mixed' : allSelected}
            aria-label="בחר הכל" disabled={loading} onClick={(e) => { e.stopPropagation(); toggleAll(); }}
            className="flex h-auto w-full min-w-0 items-center justify-start gap-3 rounded-none bg-muted/40 px-3 py-2 border-b border-border">
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
            <span className="text-[15px] font-semibold text-foreground flex-1">בחר הכל</span>
            <span className="text-[14px] text-muted-foreground tabular-nums">{selection.length}/{groups.length}</span>
          </Button>}

          <div
            className="min-w-0 max-w-full max-h-[45vh] min-h-[160px] overflow-x-hidden overflow-y-auto overscroll-contain divide-y divide-border [-webkit-overflow-scrolling:touch]"
            style={{ touchAction: 'pan-y' }}
          >

            {groups.map((g) => {
              const active = isSelected(g);
              return (
                <div
                  key={g.group_id}
                  className={cn(
                    "flex w-full min-w-0 max-w-full items-center gap-3 px-3 py-2 cursor-pointer transition",
                    active ? "bg-primary/5" : "bg-background hover:bg-muted/30",
                  )}
                >
                  <Button type="button" variant="ghost" role="checkbox" aria-checked={active} aria-label={g.group_name}
                    disabled={loading} onClick={(e) => { e.stopPropagation(); toggle(g.group_id); }}
                    className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-none p-0 text-right hover:bg-transparent">
                  {selectMode && <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </div>}
                  {g.group_icon ? (
                    <img src={g.group_icon} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-7 w-7 shrink-0 rounded-md bg-muted flex items-center justify-center">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div title={g.group_name} className="min-w-0 flex-1 truncate whitespace-nowrap ps-[3px] text-[15px] font-medium text-foreground">{shortenName(g.group_name)}</div>
                  {typeof g.member_count === "number" && g.member_count > 0 && (
                    <span dir="ltr" className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                      {g.member_count >= 1e6 ? `${(g.member_count / 1e6).toFixed(1).replace(/\.0$/, '')}M` : g.member_count >= 1e3 ? `${(g.member_count / 1e3).toFixed(1).replace(/\.0$/, '')}K` : g.member_count}
                    </span>
                  )}
                  </Button>
                  {g.group_url && (
                    <Button variant="ghost" size="icon"
                      type="button"
                      title="פתח קבוצה בלשונית חדשה"
                      onClick={(e) => { e.stopPropagation(); openExternal(g.group_url); }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="שם קבוצה"
              maxLength={120}
              className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-[15px] text-foreground"
            />
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://www.facebook.com/groups/..."
              dir="ltr"
              maxLength={500}
              className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-[15px] text-foreground"
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
