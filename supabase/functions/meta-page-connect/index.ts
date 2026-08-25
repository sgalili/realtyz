// meta-page-connect — official Facebook Login for a PAGE (publishing identity).
//
// Actions (POST body { action }):
//   start      → { auth_url }                 Facebook Login URL (server holds client_id)
//   exchange   → { ok, page, pages }          code -> page access token, stored per workspace
//   status     → { connected, page }          stored binding + live page picture
//   disconnect → { ok }                       wipe the stored page binding
//
// The page access token never leaves the server: it is stored in
// public.messenger_page_bindings and used by meta-publish for Graph publishing.
import { corsHeaders } from "../_shared/cors.ts";
import { adminClient, fbAppCredentials, GRAPH, humanizeGraphError, resolveCaller } from "../_shared/fbPersonal.ts";
import { isBlockedPage, pickPrimaryPage, PRIMARY_PAGE_ID } from "../_shared/metaPages.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Page-level publishing scopes (Instagram included so IG carousels work). */
const PAGE_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_content_publish",
  // Group discovery/publishing (restricted — Meta simply omits them from the
  // dialog until App Review approves, it does not break the login).
  "user_managed_groups",
  "groups_access_member_info",
  "publish_to_groups",
];

// A Login-for-Business config_id makes Meta IGNORE `scope`, which is why the
// page/group permissions were never granted. It is opt-in through env only.
const CONFIG_ID = Deno.env.get("META_PAGE_CONFIG_ID")?.trim() || "";
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";

async function graph(path: string) {
  const res = await fetch(`${GRAPH}${path}`);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { ok: res.ok, payload };
}

/**
 * Every Meta token the workspace holds, best-first. A blocked/"Employee" page
 * token cannot list /me/accounts, so the personal user token is what actually
 * heals a bad binding.
 */
async function candidateTokens(admin: any, ownerId: string): Promise<string[]> {
  const out: string[] = [];
  const push = (t: unknown) => {
    const v = String(t ?? "").trim();
    if (v.length > 30 && !out.includes(v)) out.push(v);
  };

  const { data: personal } = await admin
    .from("fb_personal_connections")
    .select("access_token")
    .eq("workspace_owner_id", ownerId)
    .maybeSingle();
  push(personal?.access_token);

  const { data: conns } = await admin
    .from("social_connections")
    .select("credentials")
    .in("platform", ["facebook", "facebook_page", "instagram", "meta"]);
  for (const c of conns ?? []) {
    const cr: any = (c as any)?.credentials ?? {};
    push(cr.user_access_token);
    push(cr.access_token);
    push(cr.page_access_token);
    push(cr.token);
  }

  const { data: bindings } = await admin
    .from("messenger_page_bindings")
    .select("page_access_token")
    .eq("owner_id", ownerId);
  for (const b of bindings ?? []) push((b as any)?.page_access_token);

  push(Deno.env.get("META_USER_ACCESS_TOKEN"));
  push(Deno.env.get("META_PAGE_ACCESS_TOKEN"));
  push(Deno.env.get("FACEBOOK_ACCESS_TOKEN"));
  return out;
}

/**
 * Drop a cached binding that points at a blocked asset (e.g. "Employee") and
 * re-resolve the workspace's primary business Page with a real Page token.
 */
async function repairBinding(admin: any, ownerId: string, wantedPageId?: string) {
  const wanted = (wantedPageId ?? "").trim() || PRIMARY_PAGE_ID;
  const tokens = await candidateTokens(admin, ownerId);
  const tried: string[] = [];

  for (const token of tokens) {
    const r = await graph(
      `/me/accounts?fields=id,name,access_token,tasks,picture.width(160).height(160)&limit=100&access_token=${
        encodeURIComponent(token)
      }`,
    );
    const pages: any[] = Array.isArray(r.payload?.data) ? r.payload.data : [];
    if (!r.ok || pages.length === 0) {
      tried.push(String(r.payload?.error?.message ?? "no_pages"));
      continue;
    }

    const chosen = pickPrimaryPage(pages, wanted);
    if (!chosen?.access_token || isBlockedPage(chosen)) {
      tried.push("only_blocked_assets");
      continue;
    }

    await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
    await admin.from("messenger_page_bindings").delete().eq("page_id", String(chosen.id));
    const { error } = await admin.from("messenger_page_bindings").insert({
      owner_id: ownerId,
      page_id: String(chosen.id),
      page_name: chosen.name ?? null,
      page_access_token: String(chosen.access_token),
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message, tried };

    return {
      ok: true,
      page: {
        id: String(chosen.id),
        name: chosen.name ?? null,
        picture: (chosen as any)?.picture?.data?.url ?? null,
        connected_at: new Date().toISOString(),
      },
      available: pages.map((p) => ({ id: String(p.id), name: p.name ?? null })),
    };
  }

  return { ok: false, error: "לא הצלחנו לאתר את עמוד העסק דרך הטוקנים הקיימים. יש להתחבר מחדש לפייסבוק.", tried };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const caller = await resolveCaller(admin, req);
    if (!caller) return json({ error: "unauthorized" }, 401);
    const ownerId = caller.workspaceOwnerId;

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "status");
    const redirectUri = String(body?.redirect_uri ?? "").trim();

    if (action === "health") {
      const { data: row } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_access_token, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!(row as any)?.page_id) {
        return json({
          connected: false,
          needs_reconnect: true,
          page: null,
          error: "עמוד הפייסבוק אינו מחובר. יש להתחבר בעמוד החיבורים.",
        });
      }
      const probe = await graph(
        `/${(row as any).page_id}?fields=id,name&access_token=${encodeURIComponent((row as any).page_access_token ?? "")}`,
      );
      const ok = probe.ok && !!probe.payload?.id;
      return json({
        connected: ok,
        needs_reconnect: !ok,
        page: { id: String((row as any).page_id), name: (row as any).page_name ?? null },
        error: ok ? null : humanizeGraphError(probe.payload, "תוקף החיבור לפייסבוק פג. יש להתחבר מחדש."),
      });
    }

    if (action === "repair") {
      const res = await repairBinding(admin, ownerId, String(body?.page_id ?? ""));
      return json(res, res.ok ? 200 : 400);
    }

    if (action === "status") {
      let { data } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_access_token, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let row: any = data;

      // Self-heal a cached binding that points at a blocked asset ("Employee"):
      // never report it as the connected publishing identity.
      if (row?.page_id && isBlockedPage({ id: row.page_id, name: row.page_name })) {
        console.log("[meta-page-connect] blocked binding cached, repairing", { page_id: row.page_id });
        const fixed = await repairBinding(admin, ownerId);
        if (fixed.ok) {
          const { data: fresh } = await admin
            .from("messenger_page_bindings")
            .select("page_id, page_name, page_access_token, updated_at")
            .eq("owner_id", ownerId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          row = fresh;
        } else {
          await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
          return json({ connected: false, page: null, needs_reconnect: true, error: (fixed as any).error });
        }
      }

      if (!row?.page_id) return json({ connected: false, page: null });


      let picture: string | null = null;
      let instagram: { id: string; username: string | null } | null = null;
      if (row.page_access_token) {
        const r = await graph(
          `/${row.page_id}?fields=name,picture.width(160).height(160),instagram_business_account{id,username}&access_token=${
            encodeURIComponent(row.page_access_token)
          }`,
        );
        if (r.ok) {
          picture = r.payload?.picture?.data?.url ?? null;
          const ig = r.payload?.instagram_business_account;
          if (ig?.id) instagram = { id: String(ig.id), username: ig.username ?? null };
        }
      }
      return json({
        connected: true,
        page: {
          id: String(row.page_id),
          name: row.page_name ?? null,
          picture,
          connected_at: row.updated_at ?? null,
        },
        instagram,
      });
    }

    if (action === "disconnect") {
      await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      return json({ ok: true });
    }

    // Manual fallback: broker pastes a Page ID + Page access token directly.
    // Used when the Meta app is in development/testing mode and OAuth is blocked.
    if (action === "manual") {
      const pageId = String(body?.page_id ?? "").trim();
      const token = String(body?.page_access_token ?? "").trim();
      if (!/^\d{5,}$/.test(pageId)) return json({ error: "מזהה עמוד (Page ID) לא תקין." }, 400);
      if (token.length < 40) return json({ error: "טוקן העמוד קצר מדי או שגוי." }, 400);
      if (isBlockedPage({ id: pageId })) {
        return json({ error: `זהו נכס עסקי ולא עמוד פרסום. יש להזין את מזהה עמוד העסק (${PRIMARY_PAGE_ID}).` }, 400);
      }

      const verify = await graph(
        `/${pageId}?fields=name,picture.width(160).height(160),instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`,
      );
      if (!verify.ok || !verify.payload?.id) {
        return json({ error: humanizeGraphError(verify.payload, "הטוקן נדחה על ידי פייסבוק. ודא שזה Page Access Token של אותו עמוד.") }, 400);
      }

      await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      const { error: manualErr } = await admin.from("messenger_page_bindings").upsert(
        {
          owner_id: ownerId,
          page_id: pageId,
          page_name: verify.payload?.name ?? null,
          page_access_token: token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "page_id" },
      );
      if (manualErr) return json({ error: manualErr.message }, 500);

      const igManual = verify.payload?.instagram_business_account;
      return json({
        ok: true,
        connected: true,
        page: {
          id: pageId,
          name: verify.payload?.name ?? null,
          picture: verify.payload?.picture?.data?.url ?? null,
          connected_at: new Date().toISOString(),
        },
        instagram: igManual?.id ? { id: String(igManual.id), username: igManual.username ?? null } : null,
      });
    }

    const { clientId, clientSecret } = await fbAppCredentials(admin);
    if (!clientId) {
      return json({ error: "פייסבוק לא מוגדר: חסר Facebook App ID." }, 400);
    }

    if (action === "start") {
      if (!redirectUri) return json({ error: "redirect_uri is required" }, 400);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: PAGE_SCOPES.join(","),
        state: `facebook_page:${crypto.randomUUID()}`,
        auth_type: "rerequest",
      });
      if (CONFIG_ID) params.set("config_id", CONFIG_ID);
      return json({
        auth_url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`,
        scopes: PAGE_SCOPES,
      });
    }

    if (action === "exchange") {
      const code = String(body?.code ?? "").trim();
      const wantedPageId = String(body?.page_id ?? "").trim();
      if (!code || !redirectUri) return json({ error: "code and redirect_uri are required" }, 400);
      if (!clientSecret) return json({ error: "פייסבוק לא מוגדר: חסר App Secret." }, 400);

      const tokenRes = await graph(
        `/oauth/access_token?${new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        })}`,
      );
      if (!tokenRes.ok || !tokenRes.payload?.access_token) {
        return json({ error: humanizeGraphError(tokenRes.payload, "פייסבוק דחה את ההתחברות. יש לנסות להתחבר מחדש ולאשר את הרשאות העמוד.") }, 400);
      }
      let userToken = String(tokenRes.payload.access_token);

      // Long-lived user token so page tokens do not expire in an hour.
      const longRes = await graph(
        `/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: userToken,
        })}`,
      );
      if (longRes.ok && longRes.payload?.access_token) userToken = String(longRes.payload.access_token);

      const pagesRes = await graph(
        `/me/accounts?fields=id,name,access_token,picture.width(160).height(160)&access_token=${
          encodeURIComponent(userToken)
        }`,
      );
      const pages: any[] = Array.isArray(pagesRes.payload?.data) ? pagesRes.payload.data : [];
      if (!pagesRes.ok || pages.length === 0) {
        return json(
          {
            error: pagesRes.ok
              ? "לא נמצא עמוד פייסבוק שאתה מנהל. ודא שאישרת את העמוד במסך ההרשאות של פייסבוק."
              : humanizeGraphError(pagesRes.payload, "לא הצלחנו לקרוא את רשימת העמודים שאתה מנהל. ודא שאישרת הרשאות ניהול עמוד (pages_show_list, pages_manage_posts)."),
            pages: [],
          },
          400,
        );
      }

      const chosen = pickPrimaryPage(pages, wantedPageId) ?? pages[0];
      // One page per workspace: drop any previous binding, then upsert on page_id.
      await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      const { error: upsertErr } = await admin.from("messenger_page_bindings").upsert(
        {
          owner_id: ownerId,
          page_id: String(chosen.id),
          page_name: chosen.name ?? null,
          page_access_token: String(chosen.access_token),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "page_id" },
      );
      if (upsertErr) {
        console.error("[meta-page-connect] upsert failed", upsertErr);
        return json({ error: upsertErr.message }, 500);
      }

      return json({
        ok: true,
        page: {
          id: String(chosen.id),
          name: chosen.name ?? null,
          picture: chosen?.picture?.data?.url ?? null,
        },
        pages: pages.map((p) => ({ id: String(p.id), name: p.name ?? null })),
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[meta-page-connect] fatal", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
