// fb-personal-connect — official Facebook Login for a PERSONAL profile.
//
// Actions (POST body { action }):
//   start      → { auth_url }            build the Facebook Login URL (server holds client_id)
//   exchange   → { ok, identity }        code -> long-lived user token, stored per workspace
//   status     → { connected, identity } current connection metadata (no token)
//   disconnect → { ok }                  wipe the stored token + imported groups
//
// The long-lived User Access Token never leaves the server.
import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  checkTokenHealth,
  FB_BASIC_SCOPES,

  fbAppCredentials,
  FB_PERSONAL_SCOPES,
  GRAPH,
  GRAPH_VERSION,
  resolveCaller,
  humanizeGraphError,
  missingScopes,
  missingGroupScopes,
  scopeAdvisory,
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

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action ?? "status");
    const redirectUri = String(body?.redirect_uri ?? "").trim();

    if (action === "status" || action === "health") {
      const { data } = await admin
        .from("fb_personal_connections")
        .select(
          "fb_user_id, fb_user_name, fb_avatar_url, token_expires_at, scopes, connected_at, last_import_at, last_error, access_token",
        )
        .eq("workspace_owner_id", caller.workspaceOwnerId)
        .maybeSingle();
      const { count } = await admin
        .from("fb_user_groups")
        .select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", caller.workspaceOwnerId);
      const row = (data ?? null) as any;
      const missing = row?.fb_user_id ? missingScopes(row?.scopes) : [];
      const groupScopeGap = row?.fb_user_id ? missingGroupScopes(row?.scopes) : [];

      // Live token probe — the only reliable way to detect an expired/revoked
      // token so the UI can raise the reconnect banner.
      let tokenValid: boolean | null = null;
      let tokenReason: string | null = null;
      if (row?.access_token) {
        const health = await checkTokenHealth(row.access_token);
        tokenValid = health.valid;
        tokenReason = health.reason;
        if (!health.valid) {
          await admin
            .from("fb_personal_connections")
            .update({ last_error: health.reason, updated_at: new Date().toISOString() })
            .eq("workspace_owner_id", caller.workspaceOwnerId);
        }
      }
      if (row) delete row.access_token;

      return json({
        connected: !!row?.fb_user_id,
        identity: row,
        groups_count: count ?? 0,
        missing_scopes: missing,
        missing_group_scopes: groupScopeGap,
        token_valid: tokenValid,
        token_error: tokenValid === false ? tokenReason : null,
        needs_reconnect: tokenValid === false,
        scope_advisory: missing.length ? scopeAdvisory(missing) : null,
      });
    }


    if (action === "disconnect") {
      await admin
        .from("fb_user_groups")
        .delete()
        .eq("workspace_owner_id", caller.workspaceOwnerId);
      await admin
        .from("fb_personal_connections")
        .delete()
        .eq("workspace_owner_id", caller.workspaceOwnerId);
      return json({ ok: true });
    }

    const { clientId, clientSecret } = await fbAppCredentials(admin);
    if (!clientId) {
      return json(
        { error: "פייסבוק לא מוגדר: חסר Facebook App ID באפליקציית ה-OAuth המשותפת." },
        400,
      );
    }

    if (action === "start") {
      if (!redirectUri) return json({ error: "redirect_uri is required" }, 400);
      // `basic: true` is the retry path when Meta rejects the full scope dialog
      // (restricted group permissions pending App Review).
      const scopes = body?.basic === true ? FB_BASIC_SCOPES : FB_PERSONAL_SCOPES;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes.join(","),
        state: `facebook_personal:${crypto.randomUUID()}`,
        auth_type: "rerequest",
      });
      // A Facebook Login-for-Business config_id makes Meta IGNORE `scope`, so it
      // is opt-in through env only — never hardcoded.
      const configId = Deno.env.get("META_PERSONAL_CONFIG_ID")?.trim();
      if (configId) params.set("config_id", configId);
      return json({
        auth_url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`,
        scopes,
      });
    }


    if (action === "exchange") {
      const code = String(body?.code ?? "").trim();
      if (!code || !redirectUri) return json({ error: "code and redirect_uri are required" }, 400);
      if (!clientSecret) {
        return json({ error: "פייסבוק לא מוגדר: חסר App Secret." }, 400);
      }

      // 1) code -> short-lived user token
      const tokenRes = await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        })}`,
      );
      const tokenBody = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenBody?.access_token) {
        console.error("[fb-personal-connect] token exchange failed", tokenBody);
        const raw = String(tokenBody?.error?.message ?? "");
        if (/client secret/i.test(raw)) {
          return json({
            error:
              `ה-App Secret אינו תואם ל-App ID ${clientId}. יש להעתיק את ה-App Secret של אותה אפליקציית Meta ולעדכן אותו בהגדרות.`,
          }, 400);
        }
        return json({ error: humanizeGraphError(tokenBody) }, 400);
      }


      // 2) short-lived -> long-lived (≈60 days)
      let accessToken = String(tokenBody.access_token);
      let expiresIn = Number(tokenBody.expires_in ?? 0);
      const longRes = await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: accessToken,
        })}`,
      );
      const longBody = await longRes.json().catch(() => ({}));
      if (longRes.ok && longBody?.access_token) {
        accessToken = String(longBody.access_token);
        expiresIn = Number(longBody.expires_in ?? expiresIn);
      }

      // 3) identity + granted scopes
      const meRes = await fetch(
        `${GRAPH}/me?${new URLSearchParams({
          fields: "id,name,picture.width(120).height(120)",
          access_token: accessToken,
        })}`,
      );
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me?.id) {
        console.error("[fb-personal-connect] /me failed", me);
        return json({ error: humanizeGraphError(me) }, 400);
      }

      const permRes = await fetch(
        `${GRAPH}/me/permissions?${new URLSearchParams({ access_token: accessToken })}`,
      );
      const perms = await permRes.json().catch(() => ({}));
      const granted: string[] = Array.isArray(perms?.data)
        ? perms.data.filter((p: any) => p?.status === "granted").map((p: any) => String(p.permission))
        : [];

      const expiresAt = expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      const { error: upsertErr } = await admin.from("fb_personal_connections").upsert(
        {
          workspace_owner_id: caller.workspaceOwnerId,
          fb_user_id: String(me.id),
          fb_user_name: String(me.name ?? ""),
          fb_avatar_url: me?.picture?.data?.url ?? null,
          access_token: accessToken,
          token_expires_at: expiresAt,
          scopes: granted,
          connected_by: caller.userId,
          connected_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_owner_id" },
      );
      if (upsertErr) {
        console.error("[fb-personal-connect] upsert failed", upsertErr);
        return json({ error: upsertErr.message }, 500);
      }

      const missing = missingScopes(granted);
      if (missing.length) {
        await admin
          .from("fb_personal_connections")
          .update({ last_error: scopeAdvisory(missing), updated_at: new Date().toISOString() })
          .eq("workspace_owner_id", caller.workspaceOwnerId);
      }

      return json({
        ok: true,
        missing_scopes: missing,
        scope_advisory: missing.length ? scopeAdvisory(missing) : null,
        identity: {
          fb_user_id: String(me.id),
          fb_user_name: String(me.name ?? ""),
          fb_avatar_url: me?.picture?.data?.url ?? null,
          token_expires_at: expiresAt,
          scopes: granted,
        },
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("[fb-personal-connect] fatal", e);
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
