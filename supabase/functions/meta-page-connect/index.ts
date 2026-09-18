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
 * Scopes that MUST appear in every dialog request (including the "basic" retry),
 * otherwise the resulting Page token cannot read posts/comments or publish.
 */
const REQUIRED_PAGE_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
];

/**
 * Reduced tier used as an automatic second attempt. It still asks for the
 * required Page permissions — only optional/advanced extras are dropped.
 */
const BASIC_PAGE_SCOPES = ["public_profile", ...REQUIRED_PAGE_SCOPES];

/** Union that guarantees the required Page scopes are always requested. */
function withRequiredScopes(list: string[]): string[] {
  return Array.from(new Set([...list, ...REQUIRED_PAGE_SCOPES]));
}



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

/** Hard ceiling for a single Graph call so the callback can never hang. */
const GRAPH_TIMEOUT_MS = 8_000;

async function graph(path: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAPH}${path}`, { signal: controller.signal });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    return { ok: res.ok, payload };
  } catch (e) {
    const aborted = (e as any)?.name === "AbortError";
    console.error("[meta-page-connect] graph call failed", aborted ? "timeout" : String(e));
    return {
      ok: false,
      payload: {
        error: {
          message: aborted
            ? "פייסבוק לא השיב בזמן. יש לנסות להתחבר שוב."
            : String((e as any)?.message ?? e),
        },
      },
    } as any;
  } finally {
    clearTimeout(timer);
  }
}

const PAGE_FIELDS = "id,name,access_token,picture.width(160).height(160)";

/**
 * Resolve every Page the user can manage. `/me/accounts` alone comes back empty
 * for Business-portfolio ("New Pages Experience") Pages even when the user
 * ticked the Page in the permissions dialog, which is why a checked Page looked
 * ignored. Fall back to the business portfolios before declaring "no Page".
 */
async function discoverPages(
  userToken: string,
  app?: { clientId?: string | null; clientSecret?: string | null },
): Promise<{ pages: any[]; lastPayload: any; ok: boolean }> {
  const tok = encodeURIComponent(userToken);
  const collected: any[] = [];
  const seen = new Set<string>();
  const push = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      const id = String(p?.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      collected.push(p);
    }
  };

  // 1) /me/accounts, following pagination.
  let next: string | null = `${GRAPH}/me/accounts?limit=100&fields=${PAGE_FIELDS}&access_token=${tok}`;
  let lastPayload: any = null;
  let ok = false;
  for (let i = 0; i < 5 && next; i++) {
    const res = await graph(next.startsWith(GRAPH) ? next.slice(GRAPH.length) : next);
    lastPayload = res.payload;
    ok = ok || res.ok;
    if (!res.ok) break;
    push(res.payload?.data);
    const nxt = res.payload?.paging?.next;
    next = typeof nxt === "string" && nxt.startsWith(GRAPH) ? nxt : null;
  }
  if (collected.length > 0) return { pages: collected, lastPayload, ok: true };

  // 2) Business portfolios: owned + client pages.
  const bizRes = await graph(`/me/businesses?limit=50&fields=id,name&access_token=${tok}`);
  const businesses: any[] = Array.isArray(bizRes.payload?.data) ? bizRes.payload.data : [];
  for (const biz of businesses.slice(0, 10)) {
    const bizId = String(biz?.id ?? "");
    if (!bizId) continue;
    for (const edge of ["owned_pages", "client_pages"]) {
      const r = await graph(`/${bizId}/${edge}?limit=100&fields=${PAGE_FIELDS}&access_token=${tok}`);
      if (r.ok) {
        ok = true;
        push(r.payload?.data);
      } else {
        lastPayload = r.payload ?? lastPayload;
      }
    }
  }
  if (collected.length > 0) {
    console.log("[meta-page-connect] pages resolved via business portfolio", collected.length);
    return { pages: collected, lastPayload, ok: true };
  }

  // 3) The user DID tick a Page in the permissions dialog but neither
  // /me/accounts nor the business edges list it (common with the New Pages
  // Experience). The ticked Page IDs are recorded on the grant itself, under
  // `granular_scopes[].target_ids` — read them via /debug_token and resolve
  // each Page directly.
  if (app?.clientId && app?.clientSecret) {
    const appToken = encodeURIComponent(`${app.clientId}|${app.clientSecret}`);
    const dbg = await graph(
      `/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${appToken}`,
    );
    const granular: any[] = Array.isArray(dbg.payload?.data?.granular_scopes)
      ? dbg.payload.data.granular_scopes
      : [];
    const targetIds = new Set<string>();
    for (const g of granular) {
      if (!Array.isArray(g?.target_ids)) continue;
      for (const id of g.target_ids) {
        const s = String(id ?? "");
        if (s) targetIds.add(s);
      }
    }
    if (targetIds.size === 0) lastPayload = dbg.payload ?? lastPayload;
    for (const id of Array.from(targetIds).slice(0, 25)) {
      const r = await graph(`/${id}?fields=${PAGE_FIELDS}&access_token=${tok}`);
      if (r.ok && r.payload?.id) {
        ok = true;
        push([r.payload]);
      } else {
        lastPayload = r.payload ?? lastPayload;
      }
    }
    if (collected.length > 0) {
      console.log("[meta-page-connect] pages resolved via granular_scopes", collected.length);
      return { pages: collected, lastPayload, ok: true };
    }
  }

  return { pages: collected, lastPayload, ok };
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


/**
 * Atomically claim the one-time login state BEFORE the authorization code is
 * sent to Meta. A Facebook `code` may be exchanged exactly once: a second
 * attempt (StrictMode remount, "try again", duplicate tab) gets
 * `code 100 / subcode 36009 — This authorization code has been used`, which
 * used to surface as a generic timeout. Claiming first turns that race into an
 * explicit, actionable answer.
 *
 * Returns "claimed" for the single winning attempt, "already" for every later
 * attempt on the same state, and "no_state" when there is nothing to claim
 * (implicit token flows, states that predate this table).
 */
async function claimAuthCode(
  admin: ReturnType<typeof adminClient>,
  state: string,
): Promise<"claimed" | "already" | "no_state"> {
  if (!state) return "no_state";
  try {
    const { data, error } = await admin
      .from("oauth_connection_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state", state)
      .eq("provider", "facebook_page")
      .is("consumed_at", null)
      .select("state");
    if (error) {
      console.warn("[meta-page-connect] code claim failed", error.message);
      return "no_state";
    }
    if (Array.isArray(data) && data.length > 0) return "claimed";
    const { data: existing } = await admin
      .from("oauth_connection_states")
      .select("state")
      .eq("state", state)
      .maybeSingle();
    return existing ? "already" : "no_state";
  } catch (e) {
    console.warn("[meta-page-connect] code claim threw", String((e as any)?.message ?? e));
    return "no_state";
  }
}

const REQUEST_TIMEOUT_MS = 8_000;

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "status");
    let caller = await resolveCaller(admin, req);

    // The canonical Facebook callback can be on a different Realtyz domain
    // than the user's session. Resolve it through short-lived, single-use state
    // stored when the authenticated user starts the flow.
    if (!caller && action === "exchange") {
      const state = String(body?.state ?? "").trim();
      if (state) {
        const now = new Date().toISOString();
        // Idempotent consumption: the callback can legitimately fire twice
        // (StrictMode remount, user pressing "try again"), so an already
        // consumed-but-unexpired state must still resolve the caller.
        const { data: oauthStateRow } = await admin
          .from("oauth_connection_states")
          .select("user_id, workspace_owner_id")
          .eq("state", state)
          .eq("provider", "facebook_page")
          .gt("expires_at", now)
          .maybeSingle();
        if (oauthStateRow) {
          // NOTE: the state row is NOT consumed here — the exchange handler
          // claims it atomically right before the token call (see claimAuthCode)
          // so a retry race can never send the same `code` to Meta twice.
          caller = {
            userId: String(oauthStateRow.user_id),
            workspaceOwnerId: String(oauthStateRow.workspace_owner_id),
          };
        } else {
          console.error("[meta-page-connect] no usable oauth state row for", state);
        }
      }
    }
    if (!caller) {
      return json(
        {
          error: "פג תוקף חיבור הפייסבוק. חזרו למערכת ולחצו שוב על חיבור עמוד הפייסבוק.",
          stage: "callback_state",
        },
        action === "exchange" ? 200 : 401,
      );
    }

    // The client tells us WHICH workspace it is rendering. Trusting the explicit
    // (membership-verified) owner id removes the race right after a workspace
    // switch, where profiles.active_workspace_owner_id can still be the old one.
    let ownerId = caller.workspaceOwnerId;
    const requestedOwnerId = String(body?.owner_id ?? body?.user_id ?? "").trim();
    if (requestedOwnerId && requestedOwnerId !== ownerId) {
      if (requestedOwnerId === caller.userId) {
        ownerId = requestedOwnerId;
      } else {
        const { data: member } = await admin
          .from("workspace_memberships")
          .select("user_id")
          .eq("workspace_owner_id", requestedOwnerId)
          .eq("user_id", caller.userId)
          .maybeSingle();
        if (member) ownerId = requestedOwnerId;
      }
    }

    /** The platform-shared Page every workspace may use when it has none. */
    const sharedBinding = async () => {
      const { data } = await admin
        .from("messenger_page_bindings")
        .select("page_id, page_name, page_avatar_url, page_access_token, updated_at")
        .eq("is_platform_shared", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    };

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

      let bindings = (rows ?? []) as any[];

      // Same fallback the UI shows (get_effective_meta_page): a workspace with
      // no own binding still uses the platform-shared Page, so it must never be
      // reported as "not connected".
      if (bindings.length === 0) {
        const shared = await sharedBinding();
        if (shared?.page_id) bindings = [shared];
      }

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
          try {
            const r = await graph(`/${pageId}?fields=id&access_token=${encodeURIComponent(token)}`);
            const errCode = Number(r.payload?.error?.code ?? 0);
            const ok = !!(r.ok && r.payload?.id);
            return { ok, authFailure: !ok && AUTH_FAILURE_CODES.includes(errCode), errorPayload: r.payload };
          } catch (error) {
            return { ok: false, authFailure: false, errorPayload: { error: { message: error instanceof Error ? error.message : String(error) } } };
          }
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
      // Fall back to the platform-shared Page, exactly like the UI resolver.
      const row: any = (data as any)?.page_id ? data : await sharedBinding();


      if (!row?.page_id) {
        return json({ connected: false, page: null, needs_reconnect: false });
      }



      const ident = await fetchPageIdentity(admin, ownerId, String(row.page_id), row.page_access_token ?? null).catch(() => ({
        ok: false,
        name: null,
        picture: null,
        instagram: null,
        token: null,
        errorPayload: null,
      }));
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

    // Disconnect ONE specific Page: removes only that binding and every post it
    // brought into this workspace, so the feed loses those posts instantly.
    if (action === "disconnect_page") {
      const pageId = String(body?.page_id ?? "").trim();
      if (!pageId) return json({ ok: false, error: "חסר מזהה עמוד." }, 200);

      const { error: delErr } = await admin
        .from("messenger_page_bindings")
        .delete()
        .eq("owner_id", ownerId)
        .eq("page_id", pageId);
      if (delErr) return json({ ok: false, error: delErr.message }, 200);

      // Purge the cached posts of that Page from this workspace only.
      let removedPosts = 0;
      try {
        const { data: rows } = await admin
          .from("campaign_logs")
          .select("id, provider_message_id, target_account_ref, source_account")
          .eq("workspace_owner_id", ownerId);
        const ids = (rows ?? [])
          .filter((r: any) => {
            const pid = String(r.provider_message_id ?? "");
            return pid.startsWith(`${pageId}_`) || pid === pageId ||
              String(r.target_account_ref ?? "") === pageId ||
              String(r.source_account ?? "") === pageId;
          })
          .map((r: any) => r.id);
        if (ids.length) {
          const { error: postErr } = await admin.from("campaign_logs").delete().in("id", ids);
          if (!postErr) removedPosts = ids.length;
        }
      } catch (e) {
        console.error("[meta-page-connect] disconnect_page post purge failed", e);
      }

      // Keep a default page selected when others remain.
      const { data: remaining } = await admin
        .from("messenger_page_bindings")
        .select("page_id, is_selected")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });
      const left = (remaining ?? []) as any[];
      if (left.length > 0 && !left.some((r) => r.is_selected)) {
        await admin
          .from("messenger_page_bindings")
          .update({ is_selected: true })
          .eq("owner_id", ownerId)
          .eq("page_id", String(left[0].page_id));
      }

      return json({ ok: true, page_id: pageId, removed_posts: removedPosts, remaining: left.length });
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
      console.error("[meta-page-connect] missing Facebook App ID (FACEBOOK_CLIENT_ID / platform_oauth_apps)");
      return json({ error: "פייסבוק לא מוגדר: חסר Facebook App ID.", stage: "app_config" }, 200);
    }
    // The exchange is the only action that cannot work without the secret.
    // Fail with a descriptive 200 body so the callback shows the real reason
    // instead of "Edge Function returned a non-2xx status code".
    if (action === "exchange" && !clientSecret) {
      console.error("[meta-page-connect] missing Facebook App Secret for exchange");
      return json({
        error: "פייסבוק לא מוגדר: חסר App Secret מערכתי. יש לעדכן אותו בהגדרות המערכת.",
        stage: "app_config",
      }, 200);
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
      const scopes = withRequiredScopes(basic ? BASIC_PAGE_SCOPES : PAGE_SCOPES);
      const scopeString = scopes.join(",");
      console.log("[meta-page-connect] start scope string =", JSON.stringify(scopeString));

      const state = oauthState("facebook_page", returnOrigin);
      const { error: stateError } = await admin.from("oauth_connection_states").insert({
        state,
        provider: "facebook_page",
        user_id: caller.userId,
        workspace_owner_id: ownerId,
        return_origin: returnOrigin || null,
      });
      if (stateError) {
        console.error("[meta-page-connect] state persist failed", stateError.message);
        return json({ error: "לא ניתן להתחיל את החיבור לפייסבוק. נסה שוב.", stage: "state_create" }, 200);
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: CANONICAL_REDIRECT_URI,
        response_type: "code",
        scope: scopeString,
        state,
        // `rerequest` re-opens the consent dialog for permissions the user has
        // previously declined; `force_reauthorize` stops Meta from silently
        // reusing an older cached grant that lacks pages_read_engagement.
        auth_type: "rerequest",
        force_reauthorize: "1",
      });


      // Reconnection must honour the explicit scope list above. A Business
      // Login config_id makes Meta ignore `scope`, so only use it when a caller
      // deliberately opts into that preconfigured flow.
      if (CONFIG_ID && body?.use_config_id === true) params.set("config_id", CONFIG_ID);
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
        return json({ error: "לא התקבל קוד אימות מפייסבוק. יש לנסות להתחבר שוב.", stage: "missing_code" }, 200);
      }
      console.log(
        "[meta-page-connect] exchange redirect_uri received =",
        JSON.stringify(redirectUri),
        "using =",
        JSON.stringify(CANONICAL_REDIRECT_URI),
        "mode =",
        suppliedToken ? "implicit_token" : "code",
      );

      // Claim the code BEFORE talking to Meta: whoever loses the race is told
      // the grant was already used and to start a fresh login, instead of
      // burning the code and returning OAuthException 100/36009.
      if (!suppliedToken) {
        const claim = await claimAuthCode(admin, String(body?.state ?? "").trim());
        if (claim === "already") {
          console.warn("[meta-page-connect] duplicate exchange blocked for state", String(body?.state ?? ""));
          return json({
            error: "קוד ההתחברות של פייסבוק כבר נוצל. יש להתחיל חיבור חדש.",
            stage: "code_reused",
            restart_login: true,
          }, 200);
        }
      }

      let userToken = suppliedToken;
      if (!userToken) {
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
          }, 200);
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
        if (longRes.ok && longRes.payload?.access_token) {
          userToken = String(longRes.payload.access_token);
          const expiresIn = Number(longRes.payload?.expires_in ?? 0);
          if (Number.isFinite(expiresIn) && expiresIn > 0) {
            userTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
          }
        } else logGraphFailure("long_lived_token", longRes.payload);
      }


      // Everything below only needs the user token, so the three Graph reads run
      // CONCURRENTLY. Sequential calls were the main reason the callback could
      // outrun the browser's patience.
      const [meRes, permRes, discovered] = await Promise.all([
        graph(`/me?fields=id,name,picture.width(120).height(120)&access_token=${encodeURIComponent(userToken)}`)
          .catch((e) => ({ ok: false, payload: { error: { message: String(e) } } } as any)),
        graph(`/me/permissions?access_token=${encodeURIComponent(userToken)}`)
          .catch((e) => ({ ok: false, payload: { error: { message: String(e) } } } as any)),
        discoverPages(userToken, { clientId, clientSecret })
          .catch((e) => ({ pages: [], ok: false, lastPayload: { error: { message: String(e) } } } as any)),
      ]);
      const pagesRes = { ok: discovered.ok, payload: discovered.lastPayload ?? { data: discovered.pages } } as any;


      const grantedScopes: string[] = Array.isArray(permRes.payload?.data)
        ? permRes.payload.data
          .filter((p: any) => p?.status === "granted")
          .map((p: any) => String(p.permission))
        : [];
      console.log("[meta-page-connect] granted scopes =", JSON.stringify(grantedScopes));

      // Persist the long-lived USER token too (group discovery needs it), but
      // never make the browser wait for this write: it is post-auth bookkeeping.
      if (meRes.ok && meRes.payload?.id) {
        const personalRow = {
          workspace_owner_id: ownerId,
          fb_user_id: String(meRes.payload.id),
          fb_user_name: meRes.payload?.name ?? null,
          fb_avatar_url: meRes.payload?.picture?.data?.url ?? null,
          access_token: userToken,
          scopes: grantedScopes,
          connected_by: caller.userId,
          connected_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        };
        const personalWrite = admin
          .from("fb_personal_connections")
          .upsert(personalRow, { onConflict: "workspace_owner_id" })
          .then(({ error }) => {
            if (error) console.warn("[meta-page-connect] user token persist failed", error.message);
          });
        // Keep the isolate alive for the deferred write without blocking the response.
        try {
          (globalThis as any).EdgeRuntime?.waitUntil?.(personalWrite);
        } catch {
          void personalWrite;
        }
      }

      // Never store a Page token that cannot read posts/comments: without
      // pages_read_engagement every later refresh fails with a permission error.
      if (grantedScopes.length > 0 && !grantedScopes.includes("pages_read_engagement")) {
        console.error(
          "[meta-page-connect] pages_read_engagement missing from granted scopes",
          JSON.stringify(grantedScopes),
        );
        return json(
          {
            error:
              "ההרשאה לקריאת פוסטים ותגובות (pages_read_engagement) לא אושרה. יש להתחבר מחדש ולסמן את כל ההרשאות במסך של פייסבוק.",
            stage: "scope_validation",
            missing_scopes: ["pages_read_engagement"],
            granted_scopes: grantedScopes,
            retry_basic: true,
          },
          200,
        );
      }


      const pages: any[] = Array.isArray(discovered.pages) ? discovered.pages : [];
      // Business-portfolio edges omit the Page token: fetch it per Page so a
      // ticked Page is never dropped for lacking `access_token`.
      for (const p of pages) {
        if (p?.access_token || !p?.id) continue;
        const tokRes = await graph(
          `/${String(p.id)}?fields=access_token,name&access_token=${encodeURIComponent(userToken)}`,
        );
        if (tokRes.ok && tokRes.payload?.access_token) {
          p.access_token = String(tokRes.payload.access_token);
          p.name = p.name ?? tokRes.payload?.name ?? null;
        } else {
          logGraphFailure("page_token_fetch", tokRes.payload);
        }
      }

      if (!pagesRes.ok || pages.length === 0) {
        const detail = logGraphFailure("list_pages", pagesRes.payload);
        // A permission/scope rejection means the platform app is not yet approved
        // for advanced access for THIS user: tell the UI to retry the dialog with
        // the review-free basic scopes instead of dead-ending the user.
        const permissionBlocked = !pagesRes.ok &&
          ([200, 3, 10, 102, 190].includes(Number(detail.code)) ||
            /permission|scope|advanced access/i.test(detail.message ?? ""));
        // `{"data":[]}` with HTTP 200 is Facebook saying "this profile approved
        // no Page in the permissions dialog" — not an API failure. Flag it so the
        // callback screen sends the user straight back to the Page-selection step.
        const emptyPageList = pagesRes.ok && pages.length === 0;
        return json(
          {
            error: emptyPageList
              ? "לא אושר אף עמוד פייסבוק בחיבור הזה. במסך ההרשאות של פייסבוק יש לבחור את העמוד ולסמן אותו."
              : humanizeGraphError(pagesRes.payload, "לא הצלחנו לקרוא את רשימת העמודים שאתה מנהל. ודא שאישרת הרשאות ניהול עמוד (pages_show_list, pages_manage_posts)."),
            error_detail: detail,
            fb_message: detail.message,
            stage: "list_pages",
            retry_basic: permissionBlocked,
            no_pages_selected: emptyPageList,
            restart_login: emptyPageList,
            granted_scopes: grantedScopes,
            pages: [],
          },
          200,
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
      // A reconnect must OVERWRITE the stored credentials for this workspace:
      // `upsert` on (owner_id, page_id) replaces page_access_token with the token
      // minted from the grant we just validated, so no old token survives.
      const { error: upsertErr } = await admin
        .from("messenger_page_bindings")
        .upsert(rows, { onConflict: "owner_id,page_id" });
      if (upsertErr) {
        console.error("[meta-page-connect] upsert failed", upsertErr);
        return json({ error: `שמירת חיבור העמוד נכשלה: ${upsertErr.message}`, stage: "db_save" }, 200);
      }
      await admin
        .from("messenger_page_bindings")
        .update({ is_selected: false })
        .eq("owner_id", ownerId)
        .neq("page_id", String(chosen.id));
      // Pages that this grant no longer covers still hold a stale token that
      // would fail every later read: drop those rows (never the shared platform
      // binding, and never another workspace's rows).
      const freshIds = rows.map((r) => r.page_id);
      const { error: pruneErr } = await admin
        .from("messenger_page_bindings")
        .delete()
        .eq("owner_id", ownerId)
        .not("is_platform_shared", "is", true)
        .not("page_id", "in", `(${freshIds.map((id) => `"${id}"`).join(",")})`);
      if (pruneErr) console.warn("[meta-page-connect] stale binding prune failed", pruneErr.message);
      // Clear the in-isolate token probe cache so the next Graph call uses the
      // fresh permissions instead of the previous grant's cached verdict.
      try {
        const { invalidateMetaTokenCache } = await import("../_shared/metaPage.ts");
        invalidateMetaTokenCache();
      } catch (cacheErr) {
        console.warn("[meta-page-connect] token cache invalidation skipped", String(cacheErr));
      }
      console.log(
        "[meta-page-connect] tokens overwritten",
        JSON.stringify({ owner: ownerId, pages: freshIds, granted: grantedScopes }),
      );



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
        const listed = await discoverPages(userToken, { clientId, clientSecret });
        const list: any[] = listed.pages;
        if (!listed.ok && list.length === 0) {
          const detail = logGraphFailure("list_pages", listed.lastPayload);
          return json({
            ok: false,
            error: humanizeGraphError(listed.lastPayload, "לא הצלחנו לקרוא את רשימת העמודים."),
            error_detail: detail,
            fb_message: detail.message,
            stage: "list_pages",
          }, 200);
        }
        for (const p of list) {
          if (p?.access_token || !p?.id) continue;
          const tokRes = await graph(
            `/${String(p.id)}?fields=access_token,name&access_token=${encodeURIComponent(userToken)}`,
          );
          if (tokRes.ok && tokRes.payload?.access_token) {
            p.access_token = String(tokRes.payload.access_token);
            p.name = p.name ?? tokRes.payload?.name ?? null;
          }
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
        // Fresh token stored: forget any cached verdict about the old one.
        try {
          const { invalidateMetaTokenCache } = await import("../_shared/metaPage.ts");
          invalidateMetaTokenCache([target.id]);
        } catch (cacheErr) {
          console.warn("[meta-page-connect] token cache invalidation skipped", String(cacheErr));
        }



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

    return json({ error: `פעולה לא מוכרת: ${action}`, stage: "unknown_action" }, 200);

  } catch (e) {
    const msg = e instanceof Error ? `${e.message}` : String(e);
    console.error("[meta-page-connect] fatal", msg, e instanceof Error ? e.stack : "");
    // Descriptive 200 body: a 500 would reach the browser as the opaque
    // "Edge Function returned a non-2xx status code".
    return json({ error: `החיבור לפייסבוק נכשל: ${msg}`, stage: "fatal" }, 200);
  }
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let timeoutId: number | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(() => {
      console.error("[meta-page-connect] absolute request timeout", { timeout_ms: REQUEST_TIMEOUT_MS });
      resolve(json({
        error: "החיבור לפייסבוק לא הושלם בתוך 8 שניות. יש לנסות שוב.",
        stage: "request_timeout",
      }, 200));
    }, REQUEST_TIMEOUT_MS);
  });

  return Promise.race([handleRequest(req), timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
});
