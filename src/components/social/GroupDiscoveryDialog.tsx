import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, Users, ExternalLink, UserPlus, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { shortenName } from "@/lib/shortenName";
import { openExternal } from "@/lib/openExternal";
import { useActiveWorkspaceOwnerId } from "@/hooks/useWorkspace";
import { useMetaPageBinding } from "@/hooks/useMetaPageBinding";
import { isExtensionInstalled } from "@/components/social/ExtensionDownloadButton";
import {
  joinGroupsViaExtension, searchGroupsViaExtension, sortDiscovered,
  type DiscoveredGroup, type JoinStatus,
} from "@/lib/extensionGroupDiscovery";

const SORTS = [
  { id: "popularity", label: "פופולריות" },
  { id: "members", label: "חברים" },
  { id: "activity", label: "פעילות" },
] as const;

const STATUS_LABEL: Record<JoinStatus | "queued" | "joining", string> = {
  queued: "בתור",
  joining: "מצטרף…",
  joined: "הצטרפת",
  requested: "בקשה נשלחה",
  already_member: "כבר חבר",
  needs_answers: "דורש מענה לשאלות",
  failed: "נכשל",
};

/** Hard cap per run so Facebook does not flag the account. */
const MAX_JOIN_BATCH = 5;

const fmtActivity = (n: number | null) => {
  if (n === null) return null;
  if (n >= 1) return `${Math.round(n).toLocaleString("he-IL")} פוסטים ביום`;
  const week = Math.round(n * 7);
  return week > 0 ? `${week} פוסטים בשבוע` : null;
};

export function GroupDiscoveryDialog({
  open, onOpenChange, blockedIds, knownIds, onJoined, installNeededOnOpen,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Bare ids of blocked groups — never offered again. */
  blockedIds?: Set<string>;
  /** Bare ids already saved in this workspace. */
  knownIds?: Set<string>;
  onJoined?: () => void;
  /** Open directly on the "install the extension" panel (set by the parent
   *  when an extension-only action was blocked). */
  installNeededOnOpen?: boolean;
}) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { data: pageBinding } = useMetaPageBinding();
  const [query, setQuery] = useState("נכסים ודירות למכירה והשכרה");
  const [results, setResults] = useState<DiscoveredGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]["id"]>("popularity");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, JoinStatus | "queued" | "joining">>({});
  const [joining, setJoining] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  const visible = useMemo(
    () => sortDiscovered(results.filter((g) => !blockedIds?.has(g.group_id)), sortBy),
    [results, blockedIds, sortBy],
  );
  const selectable = visible.filter((g) => !g.is_member && !knownIds?.has(g.group_id));
  const allPicked = selectable.length > 0 && selectable.every((g) => picked.has(g.group_id));

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    if (!isExtensionInstalled()) { toast.error("כדי לחפש קבוצות יש להתקין את תוסף Realtyz"); return; }
    setSearching(true);
    setPicked(new Set());
    setProgress({});
    try {
      const rows = await searchGroupsViaExtension(q);
      const seen = new Set<string>();
      const fresh = rows.filter((g) => g?.group_id && !seen.has(g.group_id) && seen.add(g.group_id)).slice(0, 100);
      setResults(fresh);
      // Every new group found is pre-selected for automatic joining.
      const toJoin = fresh.filter((g) => !g.is_member && !knownIds?.has(g.group_id) && !blockedIds?.has(g.group_id));
      setPicked(new Set(toJoin.map((g) => g.group_id)));
      setSearching(false);
      if (toJoin.length) void runJoin(toJoin);
      setSearched(true);
    } catch (e: any) {
      toast.error(e?.message === "timeout" ? "החיפוש לקח יותר מדי זמן. ודא שאתה מחובר לפייסבוק בדפדפן" : "החיפוש נכשל", { description: e?.message });
    } finally {
      setSearching(false);
    }
  };

  const togglePick = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(selectable.map((g) => g.group_id)));

  const saveGroup = async (g: DiscoveredGroup, joinStatus: 'joined' | 'pending' = 'joined') => {
    if (!workspaceOwnerId) return;
    const now = new Date().toISOString();
    const { error } = await (supabase as any).from("fb_user_groups").upsert({
      workspace_owner_id: workspaceOwnerId,
      group_id: `ext:${g.group_id}`,
      group_name: g.group_name,
      group_icon: g.group_icon,
      group_url: g.group_url,
      ...(g.member_count !== null ? { member_count: g.member_count } : {}),
      page_id: pageBinding?.pageId ?? null,
      source: "extension",
      join_status: joinStatus,
      is_selected: true,
      imported_at: now,
      updated_at: now,
    }, { onConflict: "workspace_owner_id,group_id" });
    if (error && /group_limit_reached/.test(error.message)) toast.error("הגעת למגבלה של 100 קבוצות");
  };

  const joinBatch = (targets: DiscoveredGroup[]) => new Promise<number>((resolve) => {
    const byId = new Map(targets.map((g) => [g.group_id, g]));
    let ok = 0;
    setProgress((prev) => ({ ...prev, ...Object.fromEntries(targets.map((g) => [g.group_id, "queued"])) }));
    const run = joinGroupsViaExtension(
      targets.map((g) => ({ group_id: g.group_id, group_url: g.group_url, group_name: g.group_name })),
      (gid, status) => {
        setProgress((prev) => ({ ...prev, [gid]: status }));
        const g = byId.get(gid);
        if (g && (status === "joined" || status === "already_member" || status === "requested")) {
          ok += 1;
           void saveGroup(g, status === "requested" ? "pending" : "joined").then(() => onJoined?.());
        }
      },
    );
    cancelRef.current = () => { cancelledRef.current = true; run.cancel(); };
    void run.done.then(() => resolve(ok));
  });

  const runJoin = async (list?: DiscoveredGroup[]) => {
    const all = [...(list ?? visible.filter((g) => picked.has(g.group_id)))].sort((a, b) => (b.member_count ?? -1) - (a.member_count ?? -1)).slice(0, 100);
    if (!all.length) return;
    if (!isExtensionInstalled()) { toast.error("כדי להצטרף לקבוצות יש להתקין את תוסף Realtyz"); return; }
    setJoining(true);
    cancelledRef.current = false;
    setProgress(Object.fromEntries(all.map((g) => [g.group_id, "queued"])));
    let ok = 0;
    for (let i = 0; i < all.length && !cancelledRef.current; i += MAX_JOIN_BATCH) {
      ok += await joinBatch(all.slice(i, i + MAX_JOIN_BATCH));
    }
    cancelRef.current = null;
    setJoining(false);
    setPicked(new Set());
    toast.success(`הטיפול הסתיים: ${ok} מתוך ${all.length} קבוצות`);
    onJoined?.();
  };

  const completeManual = async (g: DiscoveredGroup) => {
    await saveGroup(g, "pending");
    setProgress((prev) => ({ ...prev, [g.group_id]: "requested" }));
    toast.success("הקבוצה נשמרה");
    onJoined?.();
  };

  const needsSteps = visible.filter((g) => progress[g.group_id] === "needs_answers" || progress[g.group_id] === "failed");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!joining) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1.5rem)] max-w-lg p-4">
        <DialogTitle className="sr-only">חיפוש והצטרפות לקבוצות</DialogTitle>

        <form className="flex min-w-0 gap-2" onSubmit={(e) => { e.preventDefault(); void runSearch(); }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש והצטרפות לקבוצות"
            className="min-w-0 flex-1 text-[15px]" disabled={searching || joining} aria-label="מילות חיפוש" />
          <Button type="submit" disabled={searching || joining || !query.trim()} className="shrink-0 gap-1">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            חיפוש
          </Button>
        </form>

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

        {searching && (
          <div className="flex items-center justify-center gap-2 py-6 text-[14px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> מחפש קבוצות בפייסבוק…
          </div>
        )}

        {!searching && searched && visible.length === 0 && (
          <p className="py-4 text-center text-[14px] text-muted-foreground">לא נמצאו קבוצות. נסה מילות חיפוש אחרות.</p>
        )}

        {!searching && visible.length > 0 && (
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
                const member = g.is_member || knownIds?.has(g.group_id);
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
                    {(st === "needs_answers" || st === "failed") && !joining && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[13px]" onClick={() => openExternal(g.group_url)}>השלמה</Button>
                        <Button type="button" size="sm" className="h-8 px-2 text-[13px]" onClick={() => void completeManual(g)}>סיימתי</Button>
                      </div>
                    )}
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

        {needsSteps.length > 0 && !joining && (
          <p className="rounded-lg bg-muted px-3 py-2 text-[14px] leading-relaxed">
            {needsSteps.length} קבוצות דורשות צעד נוסף (שאלות או אישור). לחץ "השלמה" כדי לפתוח את הקבוצה, ענה על השאלות בפייסבוק ואז לחץ "סיימתי".
          </p>
        )}

        {visible.length > 0 && (
          <div className="flex gap-2">
            <Button type="button" className="flex-1 gap-1" disabled={joining || picked.size === 0} onClick={() => void runJoin()}>
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {picked.size > 0 ? `הצטרפות אוטומטית (${picked.size})` : "הצטרפות אוטומטית"}
            </Button>
            {joining && <Button type="button" variant="outline" onClick={() => cancelRef.current?.()}>עצירה</Button>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GroupDiscoveryDialog;
