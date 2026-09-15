---
name: Global Meta app with strict workspace isolation
description: One super-admin Meta app (2885631568443536) serves all workspaces; tokens/pages/groups/posts stay scoped per workspace owner.
type: constraint
---
Facebook/Instagram integration uses ONE global system Meta app for every user:
- App ID pinned in `src/lib/metaApp.ts` and `CANONICAL_FB_APP_ID` in `supabase/functions/_shared/fbPersonal.ts`; secret from `META_APP_SECRET`.
- Canonical redirect URI: `https://realtyz.co.il/oauth/callback`.
- `meta-page-connect` action `app_info` returns `app_valid`/`app_error` from `validateFbApp()` (client_credentials probe).
- `start` accepts `scope_tier: 'basic'` (public_profile + pages_show_list, review-free). When `exchange` fails on permissions it returns `retry_basic: true` and the UI reopens the dialog with basic scopes automatically before offering manual token entry.

FORBIDDEN (tenant isolation):
- No platform env token fallbacks anywhere: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `META_ACCESS_TOKEN` must never be used as a token source (removed from `_shared/metaPage.ts`, `sync-all-facebook-post-images`, `fetch-missing-post-media`).
- Never read page/social tokens unscoped; always filter by workspace owner.
- `messenger_page_bindings` is unique on `(owner_id, page_id)` — never on `page_id` alone. All upserts use `onConflict: "owner_id,page_id"` so two workspaces can connect the same page without stealing it.

STRICT PER-WORKSPACE (2026-08-30, supersedes the earlier platform-shared page rule):
- `get_effective_meta_page()` resolves ONLY the active workspace owner's binding — no account-level fallback, no `is_platform_shared` fallback.
- `get_account_integrations()` returns the workspace-scoped Facebook page; only WhatsApp (WBA/Green) and Yad2 stay account-level across workspaces.
- Never re-add cross-workspace or platform-shared Facebook/Instagram fallbacks.

FACEBOOK GROUPS (2026-09-15):
- `fb_user_groups` RLS is strict: `ws_current_access(workspace_owner_id)` for select/insert/update/delete (no member/super-admin cross-workspace read).
- Never query or update `fb_user_groups` / `fb_group_post_log` by `group_id` alone — always add `.eq('workspace_owner_id', owner)`.
- The browser extension group push is browser-level: a pushed list is claimed by the first workspace that saves it (`rz-ext-fb-groups-claim`); other workspaces must sync explicitly. Never auto-persist a foreign claim.

GROUPS ARE PAGE-BOUND (2026-09-15):
- `fb_user_groups.page_id` + `.source` ('page' | 'personal' | 'extension') record which connected Page produced each group; every writer must set them, and pickers hide rows whose `page_id` differs from the workspace's current binding.
- Extension group pushes: `rz-ext-fb-groups` is a browser inbox only. Cached lists live under `rz-ext-fb-groups:<workspaceOwnerId>`, the inbox is cleared on commit, and `useExtensionGroups(owner)` must always receive the active workspace owner. Never cache group lists globally.
