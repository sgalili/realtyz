// fb-groups-import — pull every Facebook group the connected personal
// profile is a member of, via the official Graph API (GET /me/groups), and
// cache them into public.fb_user_groups for the workspace.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const caller = await resolveCaller(admin, req);
    if (!caller) return json({ error: "unauthorized" }, 401);

    const conn = await loadConnection(admin, caller.workspaceOwnerId);
    if (!conn?.access_token) {
      return json(
        { groups: [], error: "פרופיל הפייסבוק האישי לא מחובר. יש להתחבר בעמוד החיבורים." },
        200,
      );
    }

    // Paginate /me/groups (Graph caps the page size).
    const rows: any[] = [];
    let url =
      `${GRAPH}/me/groups?${new URLSearchParams({
        fields: "id,name,icon,privacy,member_count,administrator",
        limit: "100",
        access_token: conn.access_token,
      })}`;

    for (let page = 0; page < 10 && url; page++) {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = humanizeGraphError(body);
        console.error("[fb-groups-import] /me/groups failed", body);
        await admin
          .from("fb_personal_connections")
          .update({ last_error: message, updated_at: new Date().toISOString() })
          .eq("workspace_owner_id", caller.workspaceOwnerId);
        return json({ groups: [], error: message }, 200);
      }
      if (Array.isArray(body?.data)) rows.push(...body.data);
      url = body?.paging?.next ?? "";
    }

    const groups = rows
      .map((g: any) => {
        const id = String(g?.id ?? "").trim();
        if (!id) return null;
        return {
          workspace_owner_id: caller.workspaceOwnerId,
          group_id: id,
          group_name: String(g?.name ?? id).trim() || id,
          group_icon: typeof g?.icon === "string" ? g.icon : null,
          group_url: `https://www.facebook.com/groups/${id}`,
          privacy: g?.privacy ? String(g.privacy) : null,
          member_count: Number.isFinite(Number(g?.member_count)) ? Number(g.member_count) : null,
          is_administrator: !!g?.administrator,
          imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (groups.length > 0) {
      const { error: upErr } = await admin
        .from("fb_user_groups")
        .upsert(groups, { onConflict: "workspace_owner_id,group_id" });
      if (upErr) {
        console.error("[fb-groups-import] upsert failed", upErr);
        return json({ groups: [], error: upErr.message }, 500);
      }
    }

    await admin
      .from("fb_personal_connections")
      .update({
        last_import_at: new Date().toISOString(),
        last_error: groups.length === 0
          ? "פייסבוק החזיר רשימת קבוצות ריקה עבור ההרשאות שאושרו."
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_owner_id", caller.workspaceOwnerId);

    console.log("[fb-groups-import] imported", groups.length, "groups for", caller.workspaceOwnerId);
    return json({ ok: true, imported: groups.length, groups });
  } catch (e) {
    console.error("[fb-groups-import] fatal", e);
    return json({ groups: [], error: String((e as any)?.message ?? e) }, 500);
  }
});
