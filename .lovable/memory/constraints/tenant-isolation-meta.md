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
