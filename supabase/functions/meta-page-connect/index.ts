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
import { adminClient, fbAppCredentials, GRAPH, humanizeGraphError, resolveCaller, validateFbApp } from "../_shared/fbPersonal.ts";
import { isBlockedPage, PRIMARY_PAGE_ID } from "../_shared/metaPages.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Core Page-level publishing scopes.
 * We intentionally do NOT request advanced/restricted permissions such as
 * Instagram publishing or group publishing here. Those require Meta App Review
 * and, when requested before approval, cause the login dialog to fail.
 */
const PAGE_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
];

/**
 * Permissions Meta grants to ANY user without App Review. Used as an automatic
 * second attempt so a brand-new workspace can always finish the login dialog
 * and bind its page identity, even before advanced access is approved.
 */
const BASIC_PAGE_SCOPES = ["public_profile", "pages_show_list"];


// A Login-for-Business config_id makes Meta IGNORE `scope`, which is why the
// page/group permissions were never granted. It is opt-in through env only.
const CONFIG_ID = Deno.env.get("META_PAGE_CONFIG_ID")?.trim() || "";
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";

/**
 * The ONLY redirect URI registered in the Meta app. Both `start` and `exchange`
 * force it, so the value Facebook signs the code against is byte-for-byte the
 * value we send back during the token exchange (Meta rejects any difference,
 * including a trailing slash or a preview host).
 */
const CANONICAL_REDIRECT_URI = "https://realtyz.co.il/oauth/callback";

/** Structured Graph error so failures are never a generic Hebrew sentence. */
function graphErrorDetail(payload: any): {
  message: string | null;
  type: string | null;
  code: number | null;
  subcode: number | null;
  trace: string | null;
} {
  const e = payload?.error ?? {};
  return {
    message: e?.message ? String(e.message) : (payload?.raw ? String(payload.raw).slice(0, 500) : null),
    type: e?.type ? String(e.type) : null,
    code: typeof e?.code === "number" ? e.code : null,
    subcode: typeof e?.error_subcode === "number" ? e.error_subcode : null,
    trace: e?.fbtrace_id ? String(e.fbtrace_id) : null,
  };
}

/** Logs the verbatim Graph payload and returns the structured detail. */
function logGraphFailure(stage: string, payload: any) {
  const detail = graphErrorDetail(payload);
  console.error(`[meta-page-connect] ${stage} failed`, JSON.stringify({ detail, payload }));
  return detail;
}

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

/** Remove every credential that could resurrect a rejected Page binding. */
async function purgeFacebookState(admin: any, ownerId: string): Promise<string[]> {
  const failures: string[] = [];
  const operations = [
    admin.from("messenger_page_bindings").delete().eq("owner_id", ownerId),
    admin.from("fb_user_groups").delete().eq("workspace_owner_id", ownerId),
    admin.from("fb_personal_connections").delete().eq("workspace_owner_id", ownerId),
    admin.from("social_connections").delete().eq("created_by", ownerId)
      .in("platform", ["facebook", "facebook_page", "instagram", "meta"]),
  ];
  const results = await Promise.all(operations);
  for (const result of results) if (result.error) failures.push(result.error.message);
  return failures;
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

  return { ok: false, name: null, picture: null, instagram: null, token: null, errorPayload: lastPayload };
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
    // Health rule: if ANY stored page binding has a token that can read its own
    // page ID, the workspace Facebook connection is healthy. Only when ZERO
    // page bindings have a working token do we surface a reconnect banner.
    if (action === "health") {
      const { data: rows } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });

      const bindings = (rows ?? []) as any[];

      if (bindings.length === 0) {
        return json({ connected: false, needs_reconnect: false, never_connected: true, page: null, error: null });
      }

      // Hard-expiry / revoked-token codes ONLY. Anything else (rate limits,
      // transient Graph errors, missing field permissions, network blips) must
      // never flip the workspace into "reconnect required".
      const AUTH_FAILURE_CODES = [190, 458, 459, 463, 464, 467, 492];

      // Lightweight token check: can this page token read its own page ID?
      const checkToken = async (pageId: string, token: string) => {
        const attempt = async () => {
          const r = await graph(`/${pageId}?fields=id&access_token=${encodeURIComponent(token)}`);
          const errCode = Number(r.payload?.error?.code ?? 0);
          const ok = !!(r.ok && r.payload?.id);
          return { ok, authFailure: !ok && AUTH_FAILURE_CODES.includes(errCode), errorPayload: r.payload };
        };
        let res = await attempt();
        // Retry once on a non-auth failure so a transient Graph hiccup can never
        // be mistaken for an expired token.
        if (!res.ok && !res.authFailure) {
          await new Promise((r) => setTimeout(r, 400));
          res = await attempt();
        }
        return res;
      };

      let firstWorking: { row: any; tokenCheck: Awaited<ReturnType<typeof checkToken>> } | null = null;
      let lastAuthFailure: any = null;
      let sawUncheckableToken = false;

      for (const row of bindings) {
        const token = String(row.page_access_token ?? "").trim();
        if (token.length <= 30) { sawUncheckableToken = true; continue; }
        const tokenCheck = await checkToken(String(row.page_id), token);
        if (tokenCheck.ok) {
          firstWorking = { row, tokenCheck };
          break;
        }
        if (tokenCheck.authFailure) lastAuthFailure = tokenCheck.errorPayload;
        else sawUncheckableToken = true;
      }

      // At least one bound page has a working token → healthy, no banner.
      if (firstWorking) {
        const { row } = firstWorking;
        // Best-effort enrichment with real name/picture/instagram (may fail for
        // missing field permissions, but the token itself is proven valid).
        const identity = await fetchPageIdentity(admin, ownerId, String(row.page_id), row.page_access_token ?? null);
        if (identity.ok && identity.name && identity.name !== row.page_name) {
          await admin
            .from("messenger_page_bindings")
            .update({ page_name: identity.name, updated_at: new Date().toISOString() })
            .eq("owner_id", ownerId)
            .eq("page_id", String(row.page_id));
        }
        return json({
          connected: true,
          stale: false,
          needs_reconnect: false,
          never_connected: false,
          page: {
            id: String(row.page_id),
            name: identity.name ?? row.page_name ?? null,
            picture: identity.picture ?? row.page_avatar_url ?? pageAvatar(String(row.page_id)),
            connected_at: row.updated_at ?? null,
          },
          instagram: identity.instagram,
          error: null,
        });
      }

      // No proven-working token. Warn ONLY when Meta definitively rejected a
      // token (hard expiry / revoked) and nothing else could be verified.
      const authFailure = !!lastAuthFailure && !sawUncheckableToken;
      const primaryRow = bindings[0];
      return json({
        // A stored page binding that was not definitively rejected still counts
        // as a live workspace connection.
        connected: !authFailure,
        stale: !authFailure,
        needs_reconnect: authFailure,
        never_connected: false,
        page: {
          id: String(primaryRow.page_id),
          name: primaryRow.page_name ?? null,
          picture: primaryRow.page_avatar_url ?? pageAvatar(String(primaryRow.page_id)),
          connected_at: primaryRow.updated_at ?? null,
        },
        instagram: null,
        error: authFailure
          ? humanizeGraphError(lastAuthFailure, "תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.")
          : null,
      });


    }


    if (action === "repair") {
      return json({ ok: false, error: "Automatic repair is disabled. Reconnect explicitly through OAuth or a verified Page token." }, 400);
    }

    if (action === "status") {
      const { data } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row: any = data;


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
      const failures = await purgeFacebookState(admin, ownerId);
      if (failures.length) return json({ error: `disconnect_failed: ${failures.join("; ")}` }, 500);
      const { count, error: verifyError } = await admin
        .from("messenger_page_bindings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId);
      if (verifyError || Number(count ?? 0) !== 0) {
        return json({ error: `disconnect_failed: ${verifyError?.message ?? "binding still exists"}` }, 500);
      }
      return json({ ok: true });
    }

    // Manual fallback: broker pastes a Page ID + Page access token directly.
    // Used when the Meta app is in development/testing mode and OAuth is blocked.
    if (action === "manual") {
      const pageId = String(body?.page_id ?? "").trim();
      const token = String(body?.page_access_token ?? "").trim();
      if (!/^\d{5,}$/.test(pageId)) return json({ error: "מזהה עמוד (Page ID) לא תקין." }, 400);
      if (token.length < 40) return json({ error: "טוקן העמוד קצר מדי או שגוי." }, 400);

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
        { onConflict: "owner_id,page_id" },
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

    // Read-only diagnostic: which Meta app the backend actually uses. The App ID
    // is public (it appears in every login URL), so returning it is safe and lets
    // the UI verify it matches the app where the redirect URIs are registered.
    // GLOBAL APP: the same super-admin managed Meta app serves every workspace,
    // so the credential probe reports platform-wide health, not per-user setup.
    if (action === "app_info") {
      const health = await validateFbApp(clientId, clientSecret);
      return json({
        app_id: clientId,
        has_secret: !!clientSecret,
        app_valid: health.valid,
        app_error: health.reason,
        graph_version: GRAPH_VERSION,
        redirect_uri: CANONICAL_REDIRECT_URI,
      });
    }

    if (action === "start") {
      // Logged verbatim so it can be diffed against Meta's Valid OAuth Redirect URIs.
      console.log(
        "[meta-page-connect] start redirect_uri requested =",
        JSON.stringify(redirectUri),
        "using =",
        JSON.stringify(CANONICAL_REDIRECT_URI),
      );
      // ZERO-FRICTION LOGIN: `basic` asks only for permissions that Meta grants
      // without App Review, so a brand-new user can always complete the dialog
      // (the UI retries with this tier when the full dialog is rejected).
      const basic = body?.scope_tier === "basic" || body?.basic === true;
      const scopes = basic ? BASIC_PAGE_SCOPES : PAGE_SCOPES;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: CANONICAL_REDIRECT_URI,
        response_type: "code",
        scope: scopes.join(","),
        state: oauthState("facebook_page", returnOrigin),
        auth_type: "rerequest",
      });
      if (CONFIG_ID) params.set("config_id", CONFIG_ID);
      return json({
        auth_url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`,
        scopes,
        scope_tier: basic ? "basic" : "full",
        app_id: clientId,
        redirect_uri: CANONICAL_REDIRECT_URI,
      });

    }


    if (action === "exchange") {
      const code = String(body?.code ?? "").trim();
      // The Facebook dialog may return an implicit user access token in the URL
      // fragment instead of a code (e.g. "Continue as ..." on an existing grant).
      const suppliedToken = String(body?.user_access_token ?? "").trim();
      if (!suppliedToken && !code) {
        return json({ error: "code or user_access_token is required" }, 400);
      }
      console.log(
        "[meta-page-connect] exchange redirect_uri received =",
        JSON.stringify(redirectUri),
        "using =",
        JSON.stringify(CANONICAL_REDIRECT_URI),
        "mode =",
        suppliedToken ? "implicit_token" : "code",
      );

      let userToken = suppliedToken;
      if (!userToken) {
        if (!clientSecret) return json({ error: "פייסבוק לא מוגדר: חסר App Secret." }, 400);
        const tokenRes = await graph(
          `/oauth/access_token?${new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: CANONICAL_REDIRECT_URI,
            code,
          })}`,
        );
        if (!tokenRes.ok || !tokenRes.payload?.access_token) {
          const detail = logGraphFailure("code_exchange", tokenRes.payload);
          return json({
            error: humanizeGraphError(tokenRes.payload, "פייסבוק דחה את ההתחברות. יש לנסות להתחבר מחדש ולאשר את הרשאות העמוד."),
            error_detail: detail,
            fb_message: detail.message,
            stage: "code_exchange",
            redirect_uri_used: CANONICAL_REDIRECT_URI,
          }, 400);
        }
        userToken = String(tokenRes.payload.access_token);
      }


      // Long-lived user token so page tokens do not expire in an hour.
      if (clientSecret) {
        const longRes = await graph(
          `/oauth/access_token?${new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: clientId,
            client_secret: clientSecret,
            fb_exchange_token: userToken,
          })}`,
        );
        if (longRes.ok && longRes.payload?.access_token) userToken = String(longRes.payload.access_token);
        else logGraphFailure("long_lived_token", longRes.payload);
      }


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
        const detail = logGraphFailure("list_pages", pagesRes.payload);
        // A permission/scope rejection means the platform app is not yet approved
        // for advanced access for THIS user: tell the UI to retry the dialog with
        // the review-free basic scopes instead of dead-ending the user.
        const permissionBlocked = !pagesRes.ok &&
          ([200, 3, 10, 102, 190].includes(Number(detail.code)) ||
            /permission|scope|advanced access/i.test(detail.message ?? ""));
        return json(
          {
            error: pagesRes.ok
              ? "לא נמצא עמוד פייסבוק שאתה מנהל. ודא שאישרת את העמוד במסך ההרשאות של פייסבוק."
              : humanizeGraphError(pagesRes.payload, "לא הצלחנו לקרוא את רשימת העמודים שאתה מנהל. ודא שאישרת הרשאות ניהול עמוד (pages_show_list, pages_manage_posts)."),
            error_detail: detail,
            fb_message: detail.message,
            stage: "list_pages",
            retry_basic: permissionBlocked,
            pages: [],
          },
          400,
        );
      }


      const selectable = pages.filter((p) => !isBlockedPage(p) && p?.access_token);
      let chosen = PRIMARY_PAGE_ID
        ? pages.find((p) => String(p?.id) === PRIMARY_PAGE_ID && p?.access_token)
        : undefined;
      // Automatic selection failed: keep the (already persisted) user token and
      // let the UI show a picker instead of aborting the whole connection.
      if (!chosen && selectable.length === 1) chosen = selectable[0];
      if (!chosen) {
        console.warn(
          "[meta-page-connect] automatic page selection failed",
          JSON.stringify({ pages: pages.map((p: any) => ({ id: String(p?.id), name: p?.name ?? null })) }),
        );
        return json({
          needs_page_selection: true,
          error: null,
          message: `לא הצלחנו לבחור עמוד אוטומטית. בחר את עמוד הפרסום מתוך הרשימה.`,
          pages: selectable.map((p) => ({ id: String(p.id), name: p.name ?? null, picture: p?.picture?.data?.url ?? null })),
        });
      }
      // MULTI-ACCOUNT: keep every page the user manages bound to this workspace
      // (never delete the previous bindings) so posts, comments and DMs can be
      // handled across all of them. The chosen page becomes the default.
      const rows = selectable.map((p) => ({
        owner_id: ownerId,
        page_id: String(p.id),
        page_name: p.name ?? null,
        page_avatar_url: p?.picture?.data?.url ?? pageAvatar(String(p.id)),
        page_access_token: String(p.access_token),
        is_selected: String(p.id) === String(chosen.id),
        updated_at: new Date().toISOString(),
      }));
      if (!rows.some((r) => r.page_id === String(chosen.id))) {
        rows.push({
          owner_id: ownerId,
          page_id: String(chosen.id),
          page_name: chosen.name ?? null,
          page_avatar_url: chosen?.picture?.data?.url ?? pageAvatar(String(chosen.id)),
          page_access_token: String(chosen.access_token),
          is_selected: true,
          updated_at: new Date().toISOString(),
        });
      }
      const { error: upsertErr } = await admin
        .from("messenger_page_bindings")
        .upsert(rows, { onConflict: "owner_id,page_id" });
      if (!upsertErr) {
        await admin
          .from("messenger_page_bindings")
          .update({ is_selected: false })
          .eq("owner_id", ownerId)
          .neq("page_id", String(chosen.id));
      }
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

    // Fallback picker support: list the pages reachable with the stored USER
    // token (saved during exchange) and bind whichever one the user selects.
    if (action === "list_pages" || action === "select_page") {
      const wantedId = String(body?.page_id ?? "").trim();
      const providedToken = String(body?.page_access_token ?? "").trim();
      const providedName = String(body?.page_name ?? "").trim();

      // A caller can hand us the page token directly (manual path). Otherwise
      // we resolve it from the stored user token via /me/accounts.
      let target: { id: string; name: string | null; token: string; picture: string | null } | null = null;

      if (action === "select_page" && wantedId && providedToken) {
        target = { id: wantedId, name: providedName || null, token: providedToken, picture: pageAvatar(wantedId) };
      } else {
        const { data: personal } = await admin
          .from("fb_personal_connections")
          .select("access_token")
          .eq("workspace_owner_id", ownerId)
          .maybeSingle();
        const userToken = String((personal as any)?.access_token ?? "");
        if (!userToken) {
          // 200 so the client can read the message instead of a bare non-2xx.
          return json({ ok: false, error: "לא נמצא טוקן משתמש שמור. יש להתחבר מחדש לפייסבוק.", stage: "user_token" }, 200);
        }
        const listRes = await graph(
          `/me/accounts?fields=id,name,access_token,picture.width(160).height(160)&access_token=${encodeURIComponent(userToken)}`,
        );
        const list: any[] = Array.isArray(listRes.payload?.data) ? listRes.payload.data : [];
        if (!listRes.ok) {
          const detail = logGraphFailure("list_pages", listRes.payload);
          return json({
            ok: false,
            error: humanizeGraphError(listRes.payload, "לא הצלחנו לקרוא את רשימת העמודים."),
            error_detail: detail,
            fb_message: detail.message,
            stage: "list_pages",
          }, 200);
        }
        const selectable = list.filter((p) => !isBlockedPage(p) && p?.access_token);

        if (action === "list_pages") {
          return json({
            ok: true,
            pages: selectable.map((p) => ({ id: String(p.id), name: p.name ?? null, picture: p?.picture?.data?.url ?? null })),
          });
        }

        const found = selectable.find((p) => String(p.id) === wantedId);
        if (!found) {
          return json({
            ok: false,
            error: "העמוד שנבחר אינו זמין בחשבון המחובר.",
            stage: "select_page",
            available: selectable.map((p) => String(p.id)),
          }, 200);
        }
        target = {
          id: String(found.id),
          name: found.name ?? null,
          token: String(found.access_token),
          picture: found?.picture?.data?.url ?? pageAvatar(String(found.id)),
        };
      }

      if (!target?.id || !target?.token) {
        return json({ ok: false, error: "חסרים מזהה עמוד או טוקן עמוד.", stage: "select_page" }, 200);
      }

      try {
        // MULTI-ACCOUNT: keep other bindings, just move the default flag.
        const { data: saved, error: selectErr } = await admin
          .from("messenger_page_bindings")
          .upsert(
            {
              owner_id: ownerId,
              page_id: target.id,
              page_name: target.name,
              page_avatar_url: target.picture,
              page_access_token: target.token,
              is_selected: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_id,page_id" },
          )
          .select("page_id, page_name, page_avatar_url")
          .maybeSingle();
        if (selectErr) throw selectErr;
        await admin
          .from("messenger_page_bindings")
          .update({ is_selected: false })
          .eq("owner_id", ownerId)
          .neq("page_id", target.id);


        return json({
          ok: true,
          page: {
            id: String(saved?.page_id ?? target.id),
            name: saved?.page_name ?? target.name,
            picture: saved?.page_avatar_url ?? target.picture,
          },
        });
      } catch (dbErr) {
        const e = dbErr as { message?: string; code?: string; details?: string; hint?: string };
        console.error("[meta-page-connect] select_page save failed", e);
        return json({
          ok: false,
          error: `שמירת העמוד בבסיס הנתונים נכשלה: ${e?.message ?? String(dbErr)}`,
          stage: "db_save",
          error_detail: {
            message: e?.message ?? String(dbErr),
            code: e?.code ?? null,
            details: e?.details ?? null,
            hint: e?.hint ?? null,
          },
        }, 200);
      }
    }

    // Every Page bound to THIS workspace (strict isolation: owner_id only).
    if (action === "bindings") {
      const { data, error } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_avatar_url, is_selected, updated_at")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });
      if (error) return json({ ok: false, error: error.message }, 200);
      return json({
        ok: true,
        bindings: (data ?? []).map((r: any) => ({
          id: String(r.page_id),
          name: r.page_name ?? null,
          picture: r.page_avatar_url ?? pageAvatar(String(r.page_id)),
          isDefault: !!r.is_selected,
        })),
      });
    }

    // Pick which connected Page is the default publishing target.
    if (action === "set_default") {
      const pageId = String(body?.page_id ?? "").trim();
      if (!pageId) return json({ ok: false, error: "חסר מזהה עמוד." }, 200);
      const { error: onErr } = await admin
        .from("messenger_page_bindings")
        .update({ is_selected: true, updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("page_id", pageId);
      if (onErr) return json({ ok: false, error: onErr.message }, 200);
      await admin
        .from("messenger_page_bindings")
        .update({ is_selected: false })
        .eq("owner_id", ownerId)
        .neq("page_id", pageId);
      return json({ ok: true, page_id: pageId });
    }

    return json({ error: "unknown_action" }, 400);

  } catch (e) {
    console.error("[meta-page-connect] fatal", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
