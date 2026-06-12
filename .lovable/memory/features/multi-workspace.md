---
name: Multi-workspace memberships
description: workspace_memberships table + selector modal + active-workspace context port from Kalpiz.
type: feature
---
- Table `workspace_memberships(user_id, workspace_owner_id, role, workspace_name, workspace_logo_url, account_type, last_accessed_at)`. Self-owner row auto-created via AFTER INSERT trigger on profiles. Backfilled for existing users.
- RPCs: `get_my_workspaces()` (returns all rows user belongs to with owner profile metadata), `set_active_workspace(_owner)` (validates membership, stamps profile.active_workspace_owner_id).
- profiles got new columns: `city`, `gender`, `phone`, `active_workspace_owner_id` — used by KI-style PersonalTab.
- Client: `WorkspaceProvider` (src/hooks/useWorkspace.tsx) loads workspaces after auth, persists active id in localStorage `realtyz-active-workspace`, auto-opens selector when `workspaces.length > 1 && !stored`.
- `WorkspaceSelectorModal` mounted globally in App.tsx — "בחר מרחב עבודה להתחברות" with self card + member cards + dotted "+ הוספת מרחב עבודה חדש" that calls `super-admin-create-user` edge fn.
- `ConnectedWorkspaceCard` on Profile personal tab: shows active workspace logo+name, swap-arrow icon opens selector, account_type dropdown ('נדל"ן', 'סוכנות', 'מתווך עצמאי', 'יזם', 'בחירות ארציות'), red "התנתק" button below.
- HeaderProfileMenu shows "החלף מרחב עבודה" item when user has >1 workspace.
- Query scoping by workspace_owner_id is NOT yet wired — `useActiveWorkspaceOwnerId()` helper exists but data hooks unchanged (deferred follow-up).
