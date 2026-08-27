// fb-groups-import — pull the Facebook groups reachable from every Meta token
// the workspace has (personal profile connection, page bindings, workspace
// social connections, platform env tokens), via the official Graph API, and
// cache them into public.fb_user_groups.
//
// Rationale: the previous version only tried the personal-profile connection,
// so a workspace connected through a Page/System-User token always saw
// "אין קבוצות זמינות". Now every candidate token is tried and results merged.
import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  GRAPH,
  humanizeGraphError,
  loadConnection,
  resolveCaller,
} from "../_shared/fbPersonal.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type GroupRow = Record<string, unknown>;

const FULL_FIELDS = "id,name,icon,picture.type(square){url},privacy,member_count,administrator";
const BASIC_FIELDS = "id,name,icon,picture.type(square){url}";

/** Every Meta token worth trying, most workspace-specific first. */
async function candidateTokens(admin: any, workspaceOwnerId: string): Promise<string[]> {
  const out: string[] = [];
  const push = (t: unknown) => {
    const s = String(t ?? "").trim();
    if (s.length > 20 && !out.includes(s)) out.push(s);
  };

  const conn = await loadConnection(admin, workspaceOwnerId);
  push(conn?.access_token);

  // TENANT ISOLATION: only tokens that belong to THIS workspace owner. Reading
  // every row (or the platform env tokens) exposed one workspace's groups to
  // every other account.
  try {
    const { data } = await admin
      .from("messenger_page_bindings")
      .select("page_access_token")
      .eq("owner_id", workspaceOwnerId)
      .order("updated_at", { ascending: false })
      .limit(10);
    for (const r of (data ?? []) as any[]) push(r?.page_access_token);
  } catch { /* ignore */ }

  try {
    const { data } = await admin
      .from("social_connections")
      .select("credentials")
      .eq("created_by", workspaceOwnerId)
      .in("platform", ["facebook", "meta", "instagram"])
      .order("updated_at", { ascending: false })
      .limit(10);
    for (const c of (data ?? []) as any[]) {
      const cred = (c?.credentials ?? {}) as Record<string, unknown>;
      push(cred.user_access_token);
      push(cred.access_token);
      push(cred.page_access_token);
      push(cred.token);
    }
  } catch { /* ignore */ }

  return out;
}


/** Read one /{node}/groups edge with pagination. Returns raw group objects. */
async function readGroups(
  node: string,
  token: string,
  fields: string,
  adminOnly: boolean,
): Promise<{ rows: any[]; error: any | null }> {
  const rows: any[] = [];
  const params = new URLSearchParams({ fields, limit: "100", access_token: token });
  if (adminOnly) params.set("admin_only", "true");
  let url = `${GRAPH}/${node}/groups?${params}`;
  for (let page = 0; page < 10 && url; page++) {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { rows, error: body };
    if (Array.isArray(body?.data)) rows.push(...body.data);
    url = body?.paging?.next ?? "";
  }
  return { rows, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const caller = await resolveCaller(admin, req);
    if (!caller) return json({ error: "unauthorized" }, 401);
    const ws = caller.workspaceOwnerId;

    const conn = await loadConnection(admin, ws);
    const tokens = await candidateTokens(admin, ws);
    if (tokens.length === 0) {
      return json(
        { groups: [], error: "לא נמצא חיבור פעיל לפייסבוק. יש להתחבר בעמוד החיבורים." },
        200,
      );
    }

    const byId = new Map<string, GroupRow>();
    let lastError: any = null;

    for (const token of tokens) {
      // Resolve the nodes this token can query: itself (/me → user or page) plus
      // every Page it manages, because a Page can expose its own groups edge.
      const meRes = await fetch(
        `${GRAPH}/me?fields=id&access_token=${encodeURIComponent(token)}`,
      );
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok) lastError = me;
      const nodes: string[] = ["me"];
      const meId = String(me?.id ?? "").trim();
      if (meId) nodes.push(meId);

      try {
        const accRes = await fetch(
          `${GRAPH}/me/accounts?fields=id&limit=100&access_token=${encodeURIComponent(token)}`,
        );
        const acc = await accRes.json().catch(() => ({}));
        for (const p of Array.isArray(acc?.data) ? acc.data : []) {
          const pid = String((p as any)?.id ?? "").trim();
          if (pid && !nodes.includes(pid)) nodes.push(pid);
        }
      } catch { /* ignore */ }

      for (const node of nodes) {
        for (const fields of [FULL_FIELDS, BASIC_FIELDS]) {
          let matched = false;
          for (const adminOnly of [false, true]) {
            const { rows, error } = await readGroups(node, token, fields, adminOnly);
            if (error) { lastError = error; continue; }
            for (const g of rows) {
              const id = String(g?.id ?? "").trim();
              if (!id || byId.has(id)) continue;
              byId.set(id, {
                workspace_owner_id: ws,
                group_id: id,
                group_name: String(g?.name ?? id).trim() || id,
                group_icon:
                  (typeof g?.picture?.data?.url === "string" ? g.picture.data.url : null) ??
                  (typeof g?.icon === "string" ? g.icon : null),
                group_url: `https://www.facebook.com/groups/${id}`,
                privacy: g?.privacy ? String(g.privacy) : null,
                member_count: Number.isFinite(Number(g?.member_count)) ? Number(g.member_count) : null,
                is_administrator: !!g?.administrator,
                imported_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            if (rows.length > 0) matched = true;
          }
          if (matched) break; // this field shape worked for the node
        }
      }
    }


    const groups = [...byId.values()];

    if (groups.length > 0) {
      const { error: upErr } = await admin
        .from("fb_user_groups")
        .upsert(groups, { onConflict: "workspace_owner_id,group_id" });
      if (upErr) {
        console.error("[fb-groups-import] upsert failed", upErr);
        return json({ groups, imported: groups.length, error: upErr.message }, 200);
      }
    }

    const message = groups.length === 0
      ? (lastError
        ? humanizeGraphError(lastError, "פייסבוק לא החזיר קבוצות עבור החשבון המחובר.")
        : "פייסבוק החזיר רשימת קבוצות ריקה עבור החשבון המחובר.")
      : null;


    try {
      await admin
        .from("fb_personal_connections")
        .update({
          last_import_at: new Date().toISOString(),
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_owner_id", ws);
    } catch { /* best effort */ }

    console.log("[fb-groups-import] imported", groups.length, "groups for", ws);
    return json({ ok: true, imported: groups.length, groups, error: message ?? undefined });
  } catch (e) {
    console.error("[fb-groups-import] fatal", e);
    return json({ groups: [], error: String((e as any)?.message ?? e) }, 500);
  }
});
