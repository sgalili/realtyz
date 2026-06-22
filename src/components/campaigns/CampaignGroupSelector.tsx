import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveWorkspaceOwnerId } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import { Users, Check, Loader2, Plus, Link2 } from "lucide-react";
import { toast } from "sonner";

const SESSION_CACHE_KEY = "rz-fb-groups-cache";
const LOCAL_MANUAL_KEY = "rz-fb-groups-manual";

export type FacebookGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  connected: boolean;
  source?: "api" | "manual";
  group_url?: string | null;
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
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [ayrshareGroups, setAyrshareGroups] = useState<FacebookGroup[]>([]);
  const [customUserGroups, setCustomUserGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = [...ayrshareGroups, ...customUserGroups];
  const hasVisibleGroups = ayrshareGroups.length > 0 || customUserGroups.length > 0;
  const manualMode = customUserGroups.length > 0;

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

  const fetchCustomGroups = async (): Promise<FacebookGroup[]> => {
    if (!workspaceOwnerId) return [];
    const { data, error } = await (supabase as any)
      .from("custom_user_groups")
      .select("id, group_name, group_url, platform, workspace_owner_id")
      .eq("workspace_owner_id", workspaceOwnerId)
      .eq("platform", "facebook")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[FB_GROUPS] custom_user_groups query failed", error);
      return [];
    }
    return (data ?? []).map((r: any) => ({
      group_id: `manual:${String(r.id)}`,
      group_name: String(r.group_name || r.group_url || "קבוצה"),
      group_icon: null,
      connected: true,
      source: "manual" as const,
      group_url: r.group_url ?? null,
    }));
  };

  // Fallback: any previously synchronized FB Group rows stored on
  // ayrshare_social_accounts. Surfaces groups even when the live API
  // rejects the request or the admin token lacks group scopes.
  const fetchSyncedGroups = async (): Promise<FacebookGroup[]> => {
    try {
      const { data, error } = await (supabase as any)
        .from("ayrshare_social_accounts")
        .select("account_ref, account_name, page_name, profile_image_url, platform")
        .in("platform", ["fbg", "facebook_group", "facebookgroup"]);
      if (error) {
        console.warn("[FB_GROUPS] synced fallback query failed", error);
        return [];
      }
      return (data ?? [])
        .filter((r: any) => r.account_ref)
        .map((r: any) => ({
          group_id: String(r.account_ref),
          group_name: String(r.page_name || r.account_name || "קבוצה"),
          group_icon: r.profile_image_url || null,
          connected: true,
          source: "api" as const,
        }));
    } catch (e) {
      console.warn("[FB_GROUPS] synced fallback exception", e);
      return [];
    }
  };

  const readLocalManual = (): FacebookGroup[] => {
    try {
      const raw = localStorage.getItem(LOCAL_MANUAL_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const writeLocalManual = (rows: FacebookGroup[]) => {
    try { localStorage.setItem(LOCAL_MANUAL_KEY, JSON.stringify(rows)); } catch {}
  };

  const load = async (opts?: { force?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      // Session-wide cache: fetch FB groups EXACTLY ONCE per app session.
      // Subsequent mounts hydrate from sessionStorage so we never re-hit the
      // provider redundantly and never blank an already-loaded list.
      if (!opts?.force) {
        try {
          const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as { ayrshare: FacebookGroup[]; manual: FacebookGroup[] };
            if (Array.isArray(parsed.ayrshare)) {
              setAyrshareGroups(parsed.ayrshare);
              const localManual = readLocalManual();
              const dbManual = Array.isArray(parsed.manual) ? parsed.manual : [];
              const seen = new Set<string>();
              const merged = [...dbManual, ...localManual].filter((g) => {
                if (seen.has(g.group_id)) return false;
                seen.add(g.group_id);
                return true;
              });
              setCustomUserGroups(merged);
              setLoading(false);
              return;
            }
          }
        } catch {}
      }

      const manual = await fetchCustomGroups();
      const localManual = readLocalManual();
      const seenManual = new Set<string>();
      const mergedManual = [...manual, ...localManual].filter((g) => {
        if (seenManual.has(g.group_id)) return false;
        seenManual.add(g.group_id);
        return true;
      });
      setCustomUserGroups(mergedManual);

      // 1) Live Ayrshare pull via active workspace profile key
      let list = await fetchFromAyrshare();
      // 2) Meta direct bypass
      if (list.length === 0) {
        const { data } = await supabase.functions.invoke("facebook-groups-fetch", { body: {} });
        list = Array.isArray((data as any)?.groups) ? (data as any).groups : [];
      }
      // 3) Previously synchronized group rows in our DB
      if (list.length === 0) {
        list = await fetchSyncedGroups();
      }
      // De-dupe API list against manual entries
      const manualIds = new Set(mergedManual.map((g) => g.group_id));
      const apiList = list.filter((g) => !manualIds.has(g.group_id));
      setAyrshareGroups(apiList);

      // Commit to session cache so the rest of the session reads from here.
      try {
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ayrshare: apiList, manual }));
      } catch {}
    } catch (e: any) {
      setAyrshareGroups([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceOwnerId]);
  // NOTE: focus listener removed — FB groups fetch is once-per-session by design.

  // Manual paste of a Facebook Group URL / ID — surfaces immediately even
  // when the provider returns an empty list, and persists in localStorage.
  const [manualUrl, setManualUrl] = useState("");
  const addManualGroup = () => {
    const raw = manualUrl.trim();
    if (!raw) return;
    // Extract group id from common URL shapes; fall back to raw token.
    const idMatch = raw.match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)/i);
    const id = idMatch ? idMatch[1] : raw.replace(/[^A-Za-z0-9._-]/g, "");
    if (!id) { toast.error("מזהה קבוצה לא תקין"); return; }
    const groupId = `manual:${id}`;
    if (customUserGroups.some((g) => g.group_id === groupId) || ayrshareGroups.some((g) => g.group_id === groupId)) {
      toast.info("הקבוצה כבר נוספה"); setManualUrl(""); return;
    }
    const row: FacebookGroup = {
      group_id: groupId,
      group_name: raw.startsWith("http") ? raw.replace(/^https?:\/\//, "").slice(0, 60) : id,
      group_icon: null,
      connected: true,
      source: "manual",
      group_url: raw.startsWith("http") ? raw : null,
    };
    const next = [row, ...customUserGroups];
    setCustomUserGroups(next);
    writeLocalManual([row, ...readLocalManual()]);
    // Auto-select newly added group
    onChange([...selectedIds, groupId]);
    setManualUrl("");
    toast.success("נוספה קבוצה ידנית");
  };


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
        setAyrshareGroups(ayrGroups);
        try {
          sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ayrshare: ayrGroups, manual: customUserGroups.filter((g) => g.source !== "manual" || !g.group_id.startsWith("manual:")) }));
        } catch {}
        toast.dismiss("fbg-connect");
        toast.success(`נטענו ${ayrGroups.length} קבוצות`);
        return;
      }

      // Meta API returned an empty list (agent is non-admin in those groups).
      // Skip the OAuth loop and surface the workspace's manual directory so
      // the operator can launch the שיתוף ידני מהיר flow.
      const manual = await fetchCustomGroups();
      toast.dismiss("fbg-connect");
      if (manual.length > 0) {
        setAyrshareGroups([]);
        setCustomUserGroups(manual);
        toast.success(`נטענו ${manual.length} קבוצות לשיתוף ידני מהיר`);
        return;
      }

      // No automatic groups AND no manual directory yet — fall back to OAuth.
      const { data, error } = await supabase.functions.invoke("ayrshare-social-link", {
        body: { platform: "fbg", profileKey: activeKey },
      });
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
        {!manualMode && (
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
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !hasVisibleGroups && !error && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קבוצות מחוברות…
        </div>
      )}

      {/* Empty state — no groups discovered from any source */}
      {!loading && !hasVisibleGroups && !error && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          לא נמצאו קבוצות פייסבוק מחוברות לפרופיל זה.
          <br />
          הדבק קישור / מזהה קבוצה למטה כדי להוסיף ידנית.
        </div>
      )}

      {/* Inline manual paste — always available so the operator can inject
          groups even when the provider returns an empty list. */}
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualGroup(); } }}
          placeholder="הדבק קישור או מזהה קבוצה (facebook.com/groups/...)"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          dir="rtl"
        />
        <button
          type="button"
          onClick={addManualGroup}
          disabled={!manualUrl.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          <Plus className="h-3 w-3" /> הוסף
        </button>
      </div>






      {/* Checkbox list */}
      {hasVisibleGroups && (
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
