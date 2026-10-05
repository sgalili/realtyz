---
name: Facebook strict workspace isolation
description: No shared/platform Facebook Page fallback; every Page, token and integration status is read only for the active workspace
type: constraint
---
User decision (2026-10-05): STRICT isolation. A workspace without its own Facebook Page shows as disconnected.
- Never fall back to `messenger_page_bindings.is_platform_shared` rows or another workspace's binding.
- OAuth state stores workspace_owner_id server-side (oauth_connection_states); callback saves only to that workspace.
- get_effective_meta_page / get_account_integrations return only the active workspace's rows.
- Env FB_PAGE_* tokens remain banned.
