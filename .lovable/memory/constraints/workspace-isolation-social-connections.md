---
name: Social/Google connections are per-workspace only
description: social_connections uniqueness and reads/writes are scoped to workspace_owner_id; disconnect hard-deletes the row for the active workspace only
type: constraint
---

- `social_connections` uniqueness is `UNIQUE (workspace_owner_id, platform)`. The old
  `UNIQUE (created_by, platform)` index is DROPPED — never reintroduce it: it forced one
  Google/social row per USER and made a second workspace overwrite the first.
- Every upsert must use `onConflict: 'workspace_owner_id,platform'`. The column default is
  `current_workspace_owner()`.
- Reads must filter `.eq('workspace_owner_id', activeWorkspaceId)`. No user-level or global
  fallback (no `created_by`-only lookup, no `workspace_owner_id IS NULL` legacy branch) —
  that caused cross-office leakage and auto-restore of disconnected services.
- Disconnect = HARD DELETE filtered by `platform` + active `workspace_owner_id`.
- The sticky UI cache (`src/lib/connectionStatusCache.ts`) must always be keyed with the
  active workspace id, never the default 'self' scope, and it is cleared on disconnect.
