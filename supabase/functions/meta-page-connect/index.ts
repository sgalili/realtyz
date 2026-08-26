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
import { isBlockedPage, KNOWN_PAGE_IDS, pickPrimaryPage, PRIMARY_PAGE_ID } from "../_shared/metaPages.ts";

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

function oauthState(prefix: string, returnOrigin: string): string {
  let encoded = "";
  try {
    const normalized = new URL(returnOrigin).origin;
    encoded = btoa(encodeURIComponent(normalized)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch { /* no return origin */ }
  return `${prefix}:${crypto.randomUUID()}:${encoded}`;
}

async function graph(path: string) {
  const res = await fetch(`${GRAPH}${path}`);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { ok: res.ok, payload };
}

/** Deterministic Page avatar (works even when the field probe is rate limited). */
function pageAvatar(pageId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/picture?type=normal`;
}

/** Persist the real page name + official avatar so the UI has them instantly. */
async function persistPageIdentity(
  admin: any,
  ownerId: string,
  pageId: string,
  name: string | null,
  picture: string | null,
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name) patch.page_name = name;
  if (picture) patch.page_avatar_url = picture;
  try {
    await admin
      .from("messenger_page_bindings")
      .update(patch)
      .eq("owner_id", ownerId)
      .eq("page_id", String(pageId));
  } catch { /* best effort */ }
}

/**
 * Real PAGE identity — never /me (which returns the personal user, e.g.
 * "Employee"). Reads /{page_id}?fields=id,name,picture with the stored Page
 * token, and if that token is not page-scoped, locates the page inside
 * /{user}/accounts to recover both the true name and a real Page token.
 */
async function fetchPageIdentity(
  admin: any,
  ownerId: string,
  pageId: string,
  storedToken: string | null,
): Promise<{
  ok: boolean;
  name: string | null;
  picture: string | null;
  instagram: { id: string; username: string | null } | null;
  token: string | null;
  errorPayload: any;
}> {
  const fields = "id,name,picture.width(160).height(160),instagram_business_account{id,username}";
  const tokens: string[] = [];
  if (storedToken && storedToken.trim().length > 30) tokens.push(storedToken.trim());

  let lastPayload: any = null;
  for (const token of tokens) {
    const r = await graph(`/${pageId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    lastPayload = r.payload;
    if (r.ok && r.payload?.id) {
      const ig = r.payload?.instagram_business_account;
      const pic = r.payload?.picture?.data?.url ?? pageAvatar(pageId);
      await persistPageIdentity(admin, ownerId, pageId, r.payload?.name ?? null, pic);
      return {
        ok: true,
        name: r.payload?.name ?? null,
        picture: r.payload?.picture?.data?.url ?? pageAvatar(pageId),
        instagram: ig?.id ? { id: String(ig.id), username: ig.username ?? null } : null,
        token,
        errorPayload: null,
      };
    }
  }

  // Direct recovery: try EVERY workspace token straight against /{page_id}.
  // A token that can read the page can also publish with it, and this path
  // works even when /me/accounts is empty (system-user tokens).
  for (const token of await candidateTokens(admin, ownerId)) {
    if (tokens.includes(token)) continue;
    const r = await graph(`/${pageId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    if (!r.ok || !r.payload?.id) { lastPayload = r.payload ?? lastPayload; continue; }
    const pic = r.payload?.picture?.data?.url ?? pageAvatar(pageId);
    await admin
      .from("messenger_page_bindings")
      .update({ page_access_token: token, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("page_id", String(pageId));
    await persistPageIdentity(admin, ownerId, pageId, r.payload?.name ?? null, pic);
    const igDirect = r.payload?.instagram_business_account;
    return {
      ok: true,
      name: r.payload?.name ?? null,
      picture: pic,
      instagram: igDirect?.id ? { id: String(igDirect.id), username: igDirect.username ?? null } : null,
      token,
      errorPayload: null,
    };
  }

  // Page-scoped recovery: walk every workspace token's /me/accounts list and
  // pull the entry whose id matches the bound page.
  for (const token of await candidateTokens(admin, ownerId)) {
    const r = await graph(
      `/me/accounts?fields=id,name,access_token,picture.width(160).height(160)&limit=100&access_token=${
        encodeURIComponent(token)
      }`,
    );
    const pages: any[] = Array.isArray(r.payload?.data) ? r.payload.data : [];
    const hit = pages.find((p) => String(p?.id) === String(pageId));
    if (!hit?.access_token) continue;

    await admin
      .from("messenger_page_bindings")
      .update({
        page_name: hit.name ?? null,
        page_access_token: String(hit.access_token),
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("page_id", String(pageId));

    const probe = await graph(`/${pageId}?fields=${fields}&access_token=${encodeURIComponent(String(hit.access_token))}`);
    const ig = probe.ok ? probe.payload?.instagram_business_account : null;
    await persistPageIdentity(
      admin,
      ownerId,
      pageId,
      probe.payload?.name ?? hit.name ?? null,
      probe.payload?.picture?.data?.url ?? hit?.picture?.data?.url ?? pageAvatar(pageId),
    );
    return {
      ok: true,
      name: probe.payload?.name ?? hit.name ?? null,
      picture: probe.payload?.picture?.data?.url ?? hit?.picture?.data?.url ?? pageAvatar(pageId),
      instagram: ig?.id ? { id: String(ig.id), username: ig.username ?? null } : null,
      token: String(hit.access_token),
      errorPayload: null,
    };
  }

  return { ok: false, name: null, picture: null, instagram: null, token: null, errorPayload: lastPayload };
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
    .in("platform", ["facebook", "facebook_page", "instagram", "meta"])
    .eq("created_by", ownerId);
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
 * Force-bind the broker's real business Page by querying it DIRECTLY
 * (GET /{page_id}?fields=id,name,picture) with every token the workspace holds.
 *
 * This never trusts /me — a business system-user token resolves to a personal
 * asset ("Employee") which is not a publishing identity. Only a token that can
 * actually read /{page_id} is stored, together with the real page name and the
 * official page picture, so the UI can never fall back to "Employee".
 */
async function forcePageBinding(
  admin: any,
  ownerId: string,
  wantedPageId?: string,
): Promise<
  | { ok: true; page: { id: string; name: string | null; picture: string | null; connected_at: string } }
  | { ok: false; tried: string[] }
> {
  const fields = "id,name,picture.width(160).height(160),instagram_business_account{id,username}";
  const wanted = (wantedPageId ?? "").trim() || PRIMARY_PAGE_ID;
  // This workspace has one authoritative publishing identity. Never silently
  // bind a user profile, business-system identity, or secondary Page.
  const pageIds = [wanted];
  const tokens = await candidateTokens(admin, ownerId);
  const tried: string[] = [];

  for (const pageId of pageIds) {
    for (const token of tokens) {
      const r = await graph(`/${pageId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
      if (!r.ok || !r.payload?.id) {
        tried.push(`${pageId}: ${String(r.payload?.error?.message ?? "unknown").slice(0, 120)}`);
        continue;
      }
      // A page-scoped token is required for publishing; verify by asking the
      // page for itself (already done) and keep the token that worked.
      const name = r.payload?.name ?? null;
      const picture = r.payload?.picture?.data?.url ?? pageAvatar(pageId);
      await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      await admin.from("messenger_page_bindings").delete().eq("page_id", String(pageId));
      const { error } = await admin.from("messenger_page_bindings").insert({
        owner_id: ownerId,
        page_id: String(pageId),
        page_name: name,
        page_avatar_url: picture,
        page_access_token: token,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        tried.push(`db: ${error.message}`);
        continue;
      }
      console.log("[meta-page-connect] force-bound page", { page_id: pageId, name });
      return { ok: true, page: { id: String(pageId), name, picture, connected_at: new Date().toISOString() } };
    }
  }
  return { ok: false, tried };
}

/**
 * Drop a cached binding that points at a blocked asset (e.g. "Employee") and
 * re-resolve the workspace's primary business Page with a real Page token.
 */
async function repairBinding(admin: any, ownerId: string, wantedPageId?: string) {
  const wanted = (wantedPageId ?? "").trim() || PRIMARY_PAGE_ID;

  // Direct /{page_id} probe first: it binds the real Page even when
  // /me/accounts is empty (system-user / limited tokens).
  const forced = await forcePageBinding(admin, ownerId, wanted);
  if (forced.ok) return { ok: true, page: forced.page, available: [] as any[] };

  const tokens = await candidateTokens(admin, ownerId);
  const tried: string[] = [...forced.tried];

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
      page_avatar_url: (chosen as any)?.picture?.data?.url ?? pageAvatar(String(chosen.id)),
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
    const returnOrigin = String(body?.return_origin ?? "").trim();

    // Unified connection state: one endpoint powering the collapsed header
    // badge, the expanded card badge and the global warning banner.
    if (action === "health") {
      const readBinding = async () => {
        const { data } = await admin
          .from("messenger_page_bindings")
          .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
          .eq("owner_id", ownerId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data as any;
      };

      let row = await readBinding();

      // Enforce the configured business Page as the sole publishing identity.
      if (row?.page_id && String(row.page_id) !== PRIMARY_PAGE_ID) {
        const fixed = await forcePageBinding(admin, ownerId, PRIMARY_PAGE_ID);
        if (fixed.ok) row = await readBinding();
        else {
          await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
          return json({ connected: false, needs_reconnect: true, never_connected: false, page: null,
            error: `יש להתחבר מחדש ולאשר גישה לעמוד ${PRIMARY_PAGE_ID}.` });
        }
      }

      // A cached blocked asset ("Employee") is not a publishing identity.
      // Never auto-create a missing binding: an explicit disconnect must stay
      // disconnected until the user starts OAuth/manual connection again.
      if (row?.page_id && isBlockedPage({ id: row.page_id, name: row.page_name })) {
        const blocked = !!row?.page_id;
        const fixed = await repairBinding(admin, ownerId);
        if (fixed.ok) row = await readBinding();
        else {
          // Never surface a business/"Employee" asset as the publishing page.
          if (blocked) await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
          return json({
            connected: false,
            needs_reconnect: blocked,
            never_connected: !blocked,
            page: null,
            error: blocked
              ? `החיבור הנוכחי מצביע על נכס עסקי ולא על עמוד הפרסום (${PRIMARY_PAGE_ID}). יש להתחבר מחדש לפייסבוק ולאשר את העמוד.`
              : "עמוד הפייסבוק אינו מחובר. יש להתחבר בעמוד החיבורים.",
          });
        }
      }

      if (!row?.page_id) {
        return json({ connected: false, needs_reconnect: false, never_connected: true, page: null, error: null });
      }

      // A stored page id + page token IS a connection: report connected first,
      // then enrich with the REAL page name/picture read from /{page_id}
      // (never /me, which returns the personal "Employee" profile).
      const hasToken = String(row.page_access_token ?? "").trim().length > 30;
      const identity = await fetchPageIdentity(admin, ownerId, String(row.page_id), row.page_access_token ?? null);
      const ok = identity.ok;
      // Only a genuine token failure (revoked / expired / permissions) may drop
      // the stored binding to "needs reconnect". Rate limits, transient 5xx and
      // network hiccups keep the persisted connection intact.
      const errCode = Number(identity.errorPayload?.error?.code ?? 0);
      const authFailure = !ok && hasToken && [190, 458, 459, 463, 464, 467, 492].includes(errCode);
      if (ok && identity.name && identity.name !== row.page_name) {
        await admin
          .from("messenger_page_bindings")
          .update({ page_name: identity.name, updated_at: new Date().toISOString() })
          .eq("owner_id", ownerId)
          .eq("page_id", String(row.page_id));
      }
      return json({
        connected: hasToken && !authFailure,
        stale: !ok && !authFailure,
        needs_reconnect: authFailure,
        never_connected: false,
        page: {
          id: String(row.page_id),
          name: identity.name ?? row.page_name ?? null,
          picture: identity.picture ?? row.page_avatar_url ?? pageAvatar(String(row.page_id)),
          connected_at: row.updated_at ?? null,
        },
        instagram: identity.instagram,
        error: authFailure
          ? humanizeGraphError(identity.errorPayload, "תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.")
          : null,
      });


    }


    if (action === "repair") {
      const res = await repairBinding(admin, ownerId, String(body?.page_id ?? ""));
      return json(res, res.ok ? 200 : 400);
    }

    if (action === "status") {
      let { data } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let row: any = data;

      if (row?.page_id && String(row.page_id) !== PRIMARY_PAGE_ID) {
        const fixed = await forcePageBinding(admin, ownerId, PRIMARY_PAGE_ID);
        if (!fixed.ok) {
          await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
          return json({ connected: false, page: null, needs_reconnect: true,
            error: `יש להתחבר מחדש ולאשר גישה לעמוד ${PRIMARY_PAGE_ID}.` });
        }
        const { data: fresh } = await admin
          .from("messenger_page_bindings")
          .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
          .eq("owner_id", ownerId)
          .eq("page_id", PRIMARY_PAGE_ID)
          .maybeSingle();
        row = fresh;
      }

      // Self-heal a cached binding that points at a blocked asset ("Employee"):
      // never report it as the connected publishing identity.
      if (row?.page_id && isBlockedPage({ id: row.page_id, name: row.page_name })) {
        console.log("[meta-page-connect] blocked binding cached, repairing", { page_id: row.page_id });
        const fixed = await repairBinding(admin, ownerId);
        if (fixed.ok) {
          const { data: fresh } = await admin
            .from("messenger_page_bindings")
            .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
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

      if (!row?.page_id) {
        return json({ connected: false, page: null, needs_reconnect: false });
      }


      const ident = await fetchPageIdentity(admin, ownerId, String(row.page_id), row.page_access_token ?? null);
      if (ident.ok && ident.name && ident.name !== row.page_name) {
        await admin
          .from("messenger_page_bindings")
          .update({ page_name: ident.name, updated_at: new Date().toISOString() })
          .eq("owner_id", ownerId)
          .eq("page_id", String(row.page_id));
      }
      return json({
        connected: true,
        page: {
          id: String(row.page_id),
          name: ident.name ?? row.page_name ?? null,
          picture: ident.picture ?? row.page_avatar_url ?? pageAvatar(String(row.page_id)),
          connected_at: row.updated_at ?? null,
        },
        instagram: ident.instagram,
      });


    }

    if (action === "disconnect") {
      const failures: string[] = [];
      const bindingDelete = await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      if (bindingDelete.error) failures.push(bindingDelete.error.message);

      // The Page OAuth exchange also stores its long-lived user token for group
      // discovery. Clear it and imported groups so health/status cannot rebuild
      // the just-disconnected Page from residual credentials.
      const groupsDelete = await admin.from("fb_user_groups").delete().eq("workspace_owner_id", ownerId);
      if (groupsDelete.error) failures.push(groupsDelete.error.message);
      const personalDelete = await admin.from("fb_personal_connections").delete().eq("workspace_owner_id", ownerId);
      if (personalDelete.error) failures.push(personalDelete.error.message);
      const socialDelete = await admin
        .from("social_connections")
        .delete()
        .eq("created_by", ownerId)
        .in("platform", ["facebook", "facebook_page", "instagram", "meta"]);
      if (socialDelete.error) failures.push(socialDelete.error.message);

      if (failures.length) return json({ error: `disconnect_failed: ${failures.join("; ")}` }, 500);
      return json({ ok: true });
    }

    // Manual fallback: broker pastes a Page ID + Page access token directly.
    // Used when the Meta app is in development/testing mode and OAuth is blocked.
    if (action === "manual") {
      const pageId = String(body?.page_id ?? "").trim();
      const token = String(body?.page_access_token ?? "").trim();
      if (!/^\d{5,}$/.test(pageId)) return json({ error: "מזהה עמוד (Page ID) לא תקין." }, 400);
      if (pageId !== PRIMARY_PAGE_ID) return json({ error: `יש להזין את מזהה עמוד העסק ${PRIMARY_PAGE_ID}.` }, 400);
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
          page_avatar_url: verify.payload?.picture?.data?.url ?? pageAvatar(pageId),
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
      // Logged verbatim so it can be diffed against Meta's Valid OAuth Redirect URIs.
      console.log("[meta-page-connect] start redirect_uri =", JSON.stringify(redirectUri));
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: PAGE_SCOPES.join(","),
        state: oauthState("facebook_page", returnOrigin),
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
      console.log("[meta-page-connect] exchange redirect_uri =", JSON.stringify(redirectUri));
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

      // Persist the long-lived USER token too: group discovery (/me/groups)
      // requires a user token, and a page login already grants it.
      try {
        const meRes = await graph(
          `/me?fields=id,name,picture.width(120).height(120)&access_token=${encodeURIComponent(userToken)}`,
        );
        const permRes = await graph(`/me/permissions?access_token=${encodeURIComponent(userToken)}`);
        const granted: string[] = Array.isArray(permRes.payload?.data)
          ? permRes.payload.data
            .filter((p: any) => p?.status === "granted")
            .map((p: any) => String(p.permission))
          : [];
        if (meRes.ok && meRes.payload?.id) {
          await admin.from("fb_personal_connections").upsert(
            {
              workspace_owner_id: ownerId,
              fb_user_id: String(meRes.payload.id),
              fb_user_name: meRes.payload?.name ?? null,
              fb_avatar_url: meRes.payload?.picture?.data?.url ?? null,
              access_token: userToken,
              scopes: granted,
              connected_by: caller.userId,
              connected_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_owner_id" },
          );
        }
      } catch (e) {
        console.warn("[meta-page-connect] user token persist failed", e);
      }

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

      // Never bind a blocked business asset ("Employee") as the publishing page.
      const chosen = pages.find((p) => String(p?.id) === PRIMARY_PAGE_ID);
      if (!chosen) {
        return json({
          error: `החשבון שאושר אינו מנהל את עמוד ${PRIMARY_PAGE_ID}. יש להתחבר עם משתמש Meta שמנהל את העמוד ולאשר pages_show_list.`,
          pages: pages.filter((p) => !isBlockedPage(p)).map((p) => ({ id: String(p.id), name: p.name ?? null })),
        }, 400);
      }
      if (!chosen?.access_token) {
        return json({ error: "פייסבוק לא החזיר טוקן עמוד. יש להתחבר מחדש ולאשר את העמוד." }, 400);
      }
      // One page per workspace: drop any previous binding, then upsert on page_id.
      await admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId);
      const { error: upsertErr } = await admin.from("messenger_page_bindings").upsert(
        {
          owner_id: ownerId,
          page_id: String(chosen.id),
          page_name: chosen.name ?? null,
          page_avatar_url: chosen?.picture?.data?.url ?? pageAvatar(String(chosen.id)),
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
