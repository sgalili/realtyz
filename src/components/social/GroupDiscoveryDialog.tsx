import { useEffect, useMemo, useState } from "react";
import { Check, Cloud, Loader2, Plus, Search, Settings2, Users, ExternalLink, Activity } from "lucide-react";
import { FacebookCloudConnectGate } from "./FacebookCloudConnectGate";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { shortenName } from "@/lib/shortenName";
import { fbGroupUrl } from "@/lib/fbGroupUrl";
import { openExternal } from "@/lib/openExternal";
import { useActiveWorkspaceOwnerId } from "@/hooks/useWorkspace";
import { useMetaPageBinding } from "@/hooks/useMetaPageBinding";
import { getCloudSessionState, type CloudSessionState } from "@/lib/cloudSession";
import { fetchGroupsViaCloud } from "@/lib/cloudGroupDiscovery";
import {
  sortDiscovered,
  type DiscoveredGroup, type JoinStatus,
} from "@/lib/extensionGroupDiscovery";

const SORTS = [
  { id: "popularity", label: "פופולריות" },
  { id: "members", label: "חברים" },
  { id: "activity", label: "פעילות" },
] as const;

const STATUS_LABEL: Record<JoinStatus | "queued" | "joining" | "saved", string> = {
  queued: "בתור",
  joining: "מצטרף…",
  joined: "הצטרפת",
  requested: "בקשה נשלחה",
  already_member: "כבר חבר",
  needs_answers: "דורש מענה לשאלות",
  failed: "נכשל",
  saved: "נשמר",
};


const fmtActivity = (n: number | null) => {
  if (n === null) return null;
  if (n >= 1) return `${Math.round(n).toLocaleString("he-IL")} קמפיינים ביום`;
  const week = Math.round(n * 7);
  return week > 0 ? `${week} קמפיינים בשבוע` : null;
};

/**
 * GroupDiscoveryDialog — cloud-first group search.
 *
 * Primary path: search through the workspace's saved cloud Facebook session
 * (Railway cloud runner). No local browser extension needed. Results can be
 * saved straight into the workspace posting pool.
 *
 */
export function GroupDiscoveryDialog({
  open, onOpenChange, blockedIds, knownIds, onJoined,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Bare ids of blocked groups — never offered again. */
  blockedIds?: Set<string>;
  /** Bare ids already saved in this workspace. */
  knownIds?: Set<string>;
  onJoined?: () => void;
}) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { data: pageBinding } = useMetaPageBinding();
  const [query, setQuery] = useState("נכסים ודירות למכירה והשכרה");
  const [cloud, setCloud] = useState<CloudSessionState | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudScanning, setCloudScanning] = useState(false);
  const [results, setResults] = useState<DiscoveredGroup[]>([]);
  const [searched, setSearched] = useState(false);
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["id"]>("popularity");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, JoinStatus | "queued" | "joining" | "saved">>({});
  const [joining, setJoining] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  // On open: load the cloud session state and pick the default tab.
  useEffect(() => {
    if (!open) return;
    setSearched(false);
    setResults([]);
    setPicked(new Set());
    setProgress({});
    setCloudLoaded(false);
    let alive = true;
    void getCloudSessionState().then((state) => {
      if (!alive) return;
      setCloud(state);
      setCloudLoaded(true);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceOwnerId]);

  /** Manual entry: add a Facebook group by link, without any tooling. */
  const addManualGroup = async () => {
    const name = manualName.trim();
    const absoluteUrl = fbGroupUrl(manualUrl.trim());
    if (!name) { toast.error("יש למלא שם קבוצה"); return; }
    if (!absoluteUrl) { toast.error("הקישור חייב להיות כתובת קבוצת פייסבוק (facebook.com/groups/…)"); return; }
    if (!workspaceOwnerId) return;
    const idMatch = absoluteUrl.match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)/i);
    if (!idMatch) { toast.error("לא הצלחתי לזהות את מזהה הקבוצה מהקישור"); return; }
    setAddingManual(true);
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("fb_user_groups").upsert({
        workspace_owner_id: workspaceOwnerId,
        group_id: `manual:${idMatch[1]}`,
        group_name: name,
        group_url: absoluteUrl,
        page_id: pageBinding?.pageId ?? null,
        source: "manual",
        join_status: "not_joined",
        is_selected: true,
        imported_at: now,
        updated_at: now,
      }, { onConflict: "workspace_owner_id,group_id" });
      if (error) {
        toast.error(/group_limit_reached/.test(error.message) ? "המכסה מלאה: 100 פעילות ו־200 בהמתנה" : "הוספת הקבוצה נכשלה", { description: /group_limit_reached/.test(error.message) ? undefined : error.message });
        return;
      }
      setManualName("");
      setManualUrl("");
      toast.success("הקבוצה נוספה לרשימת הקבוצות");
      onJoined?.();
    } finally {
      setAddingManual(false);
    }
  };

  const visible = useMemo(
    () => sortDiscovered(results.filter((g) => !blockedIds?.has(g.group_id)), sortBy),
    [results, blockedIds, sortBy],
  );
  const selectable = visible.filter((g) => !knownIds?.has(g.group_id));
  const allPicked = selectable.length > 0 && selectable.every((g) => picked.has(g.group_id));

  const preselect = (fresh: DiscoveredGroup[]) => {
    const toPick = fresh.filter((g) => !knownIds?.has(g.group_id) && !blockedIds?.has(g.group_id));
    setPicked(new Set(toPick.map((g) => g.group_id)));
  };

  /** Cloud-first search: the Railway runner scrapes with the saved session. */
  const runCloudSearch = async () => {
    const q = query.trim();
    if (!q || cloudScanning) return;
    setCloudScanning(true);
    setPicked(new Set());
    setProgress({});
    try {
      const rows = await fetchGroupsViaCloud(q);
      const seen = new Set<string>();
      const fresh = rows.filter((g) => g?.group_id && !seen.has(g.group_id) && seen.add(g.group_id)).slice(0, 100);
      setResults(fresh);
      preselect(fresh);
      setSearched(true);
      if (!fresh.length) toast.info("לא נמצאו קבוצות — נסו מילת חיפוש אחרת");
    } catch (e: any) {
      toast.error("הסריקה בפייסבוק נכשלה", { description: e?.message });
      if (e?.message?.includes("חיבור פייסבוק")) {
        setCloud((c) => (c ? { ...c, active: false } : c));
      }
    } finally {
      setCloudScanning(false);
    }
  };

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(selectable.map((g) => g.group_id)));

  const saveGroup = async (
    g: DiscoveredGroup,
    joinStatus: "not_joined" = "not_joined",
    prefix = "fb",
    source = "cloud",
  ): Promise<boolean> => {
    if (!workspaceOwnerId) return false;
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("fb_user_groups").upsert({
      workspace_owner_id: workspaceOwnerId,
      group_id: `${prefix}:${g.group_id}`,
      group_name: g.group_name,
      group_icon: g.group_icon,
      group_url: g.group_url,
      ...(g.member_count !== null ? { member_count: g.member_count } : {}),
      page_id: pageBinding?.pageId ?? null,
      source,
      join_status: joinStatus,
      is_selected: true,
      imported_at: now,
      updated_at: now,
    }, { onConflict: "workspace_owner_id,group_id" });
    if (error && /group_limit_reached/.test(error.message)) {
      toast.error("המכסה מלאה: 100 פעילות ו־200 בהמתנה");
      return false;
    }
    return !error;
  };

  /** Cloud mode: save the picked groups into the workspace posting pool. */
  const runCloudSave = async () => {
    const list = visible.filter((g) => picked.has(g.group_id)).slice(0, 100);
    if (!list.length) return;
    setJoining(true);
    let ok = 0;
    for (const g of list) {
      if (await saveGroup(g, "not_joined", "fb", "cloud")) {
        ok += 1;
        setProgress((prev) => ({ ...prev, [g.group_id]: "saved" }));
      }
    }
    setJoining(false);
    setPicked(new Set());
    if (ok > 0) {
      toast.success(`נשמרו ${ok} קבוצות לרשימת הפרסום`, { description: "ההצטרפות תטופל בפייסבוק; קבוצות הממתינות לאישור לא יפורסמו" });
      onJoined?.();
    }
  };

  const busy = cloudScanning || joining;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!joining) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1.5rem)] max-w-lg p-4">
        <DialogTitle className="sr-only">חיפוש והצטרפות לקבוצות</DialogTitle>

        <div className="flex items-center gap-2 text-base font-semibold"><Cloud className="h-5 w-5" /> קבוצות בענן</div>
            {!cloudLoaded ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[14px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> בודק את חיבור הענן…
              </div>
            ) : cloud?.active ? (
              <form className="flex min-w-0 gap-2" onSubmit={(e) => { e.preventDefault(); void runCloudSearch(); }}>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש קבוצות לפי נושא"
                  className="min-w-0 flex-1 text-[15px]" disabled={busy} aria-label="מילות חיפוש" />
                <Button type="submit" disabled={busy || !query.trim()} className="shrink-0 gap-1">
                  {cloudScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  חיפוש בענן
                </Button>
              </form>
            ) : (
              <FacebookCloudConnectGate key={workspaceOwnerId} alwaysVisible onSynced={() => { void getCloudSessionState().then(setCloud); onJoined?.(); }} onDiscover={() => document.querySelector<HTMLInputElement>('input[aria-label="שם הקבוצה"]')?.focus()} />
            )}

            {cloudScanning && (
              <div className="flex items-center justify-center gap-2 py-6 text-[14px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> סורק קבוצות בענן… זה עשוי לקחת עד דקה
              </div>
            )}
            {!cloudScanning && searched && visible.length === 0 && (
              <p className="py-4 text-center text-[14px] text-muted-foreground">לא נמצאו קבוצות. נסה מילות חיפוש אחרות.</p>
            )}
            {!cloudScanning && visible.length > 0 && (
              <div className="flex gap-2">
                <Button type="button" className="flex-1 gap-1" disabled={joining || picked.size === 0} onClick={() => void runCloudSave()}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {picked.size > 0 ? `שמור לרשימת הפרסום (${picked.size})` : "שמור לרשימת הפרסום"}
                </Button>
              </div>
            )}
        {/* ── Shared results list ────────────────────────────────────────── */}
        {visible.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[14px]">
            <span className="text-muted-foreground">מיון:</span>
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSortBy(s.id)}
                className={cn("rounded-full px-2.5 py-0.5", sortBy === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {!busy && visible.length > 0 && (
          <div className="min-w-0 overflow-hidden rounded-lg border border-border">
            {selectable.length > 0 && (
              <button type="button" role="checkbox" aria-checked={allPicked} onClick={toggleAll} disabled={joining}
                className="flex w-full items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-right">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", allPicked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
                  {allPicked && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1 text-[15px] font-semibold">בחר הכל</span>
                {picked.size > 0 && <span className="text-[14px] tabular-nums text-muted-foreground">{picked.size}/{selectable.length}</span>}
              </button>
            )}
            <div className="max-h-[45vh] divide-y divide-border overflow-y-auto overscroll-contain">
              {visible.map((g) => {
                const member = knownIds?.has(g.group_id);
                const active = picked.has(g.group_id);
                const st = progress[g.group_id];
                const activity = fmtActivity(g.posts_per_day) || g.activity_text;
                return (
                  <div key={g.group_id} className={cn("flex min-w-0 items-center gap-3 px-3 py-2", active && "bg-primary/5")}>
                    <button type="button" role="checkbox" aria-checked={active} aria-label={g.group_name}
                      disabled={member || joining} onClick={() => togglePick(g.group_id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-right disabled:opacity-70">
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        member ? "border-muted bg-muted" : active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      {g.group_icon ? (
                        <img src={g.group_icon} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><Users className="h-4 w-4 text-muted-foreground" /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span title={g.group_name} className="block truncate text-[15px] font-medium">{shortenName(g.group_name)}</span>
                        <span className="flex min-w-0 flex-wrap gap-x-3 text-[13px] text-muted-foreground">
                          {typeof g.member_count === "number" && g.member_count > 0 && (
                            <span className="inline-flex items-center gap-1 tabular-nums"><Users className="h-3 w-3" />{g.member_count.toLocaleString("he-IL")}</span>
                          )}
                          {activity && <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" />{activity}</span>}
                          {member && !st && <span className="text-primary">כבר חבר</span>}
                          {st && <span className={cn("inline-flex items-center gap-1", st === "failed" ? "text-destructive" : "text-primary")}>
                            {st === "joining" && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label="הצטרפות בתהליך" />}
                            {STATUS_LABEL[st]}</span>}
                        </span>
                      </span>
                    </button>
                    <Button type="button" variant="ghost" size="icon" title="פתח קבוצה בלשונית חדשה"
                      onClick={() => openExternal(g.group_url)} className="h-8 w-8 shrink-0 text-muted-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Manual entry — always available, no tooling needed ─────────── */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-[14px] font-medium">הוספת קבוצה ידנית:</p>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="שם הקבוצה"
              className="min-w-0 flex-1 text-[14px]" aria-label="שם הקבוצה" />
            <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="קישור הקבוצה (facebook.com/groups/…)"
              className="min-w-0 flex-1 text-[14px]" dir="ltr" aria-label="קישור הקבוצה" />
            <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 gap-1 text-[14px]"
              disabled={addingManual || !manualName.trim() || !manualUrl.trim()} onClick={() => void addManualGroup()}>
              {addingManual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} הוספה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupDiscoveryDialog;
