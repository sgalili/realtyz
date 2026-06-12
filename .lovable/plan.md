# Realtyz multi-workspace clone of Kalpiz

## 1. Database (one migration)

New table `public.workspace_memberships`:
- `user_id uuid` (member)
- `workspace_owner_id uuid` (the user whose `profiles.workspace_owner_id` defines the workspace)
- `role text` ('owner' | 'manager' | 'agent' | 'viewer' | 'super_admin')
- `workspace_name text`, `workspace_logo_url text`, `account_type text` nullable
- `last_accessed_at timestamptz`
- unique (user_id, workspace_owner_id)
- GRANTs to authenticated + service_role; RLS: user sees only own rows; service_role full.

Profile additions (user-scoped personalization, KI parity):
- `profiles.city text`, `profiles.gender text`, `profiles.phone text` (display), `profiles.active_workspace_owner_id uuid`

Security-definer helpers:
- `get_my_workspaces()` returns rows the user belongs to + their own implicit owner row.
- `set_active_workspace(_owner uuid)` validates membership, updates `profiles.active_workspace_owner_id` + `last_accessed_at`.
- Trigger on `auth.users` insert: auto-insert self-owner membership row.
- Backfill: for every existing profile, insert one self-owner row.

## 2. Client context

New `src/hooks/useWorkspace.tsx` (`WorkspaceProvider`):
- Loads `get_my_workspaces` once after auth.
- Exposes `{ workspaces, activeWorkspaceId, setActiveWorkspace, mustChoose }`.
- `mustChoose = workspaces.length > 1 && !localStorage.realtyz-active-workspace`.
- Mounted in `App.tsx` inside `AuthProvider`.

## 3. Workspace selector modal

New `src/components/workspace/WorkspaceSelectorModal.tsx`:
- RTL dialog, title "בחר מרחב עבודה להתחברות".
- Personal "החשבון שלי · בעלים" card on top (current user).
- One card per membership row: logo, name, role subtitle ("הרשאה: …"), checkmark on active.
- Dotted "+ הוספת מרחב עבודה חדש" expands inline form (שם / אימייל / +972 phone) → calls existing `super-admin-create-user` edge fn when caller is super_admin, otherwise creates a `team_invitations` row.
- Auto-opens on first login when `mustChoose` is true (intercept in `AppLayout`).
- Reusable: also opens from the swap-arrow icon on the connected-workspace card.

## 4. Profile page redesign

Replace `PersonalTab` in `src/pages/Profile.tsx` with KI row-style layout:
- Avatar + display name centered.
- Row component: icon on right, label + value, pencil + plus + trash on the left.
- Rows: דוא״ל, וואטסאפ (05X-XXXXXXX), טלפון, עיר (IsraeliCityPicker), מגדר (זכר/נקבה select).
- "+ הוסף פרופיל" pill at bottom of rows.
- Below: `ConnectedWorkspaceCard`
  - Workspace logo right, workspace name centered, swap-arrow button top-left (opens selector modal).
  - שם המשרד / סוכנות input + סוג חשבון dropdown (placeholder list incl. "בחירות ארציות" preserved for KI parity, defaulted to "נדל\"ן" for Realtyz).
- Red outlined "התנתק" button at bottom triggering `signOut()`.

Keep `WorkspaceTab` ("המשרד") as-is (already matches screenshot 230496) but ensure logo/name/service-areas + save button render in current RTL flow.

## 5. Active-workspace query scoping

Add `useActiveWorkspaceFilter()` helper returning the current `workspace_owner_id`.
Touch the high-traffic data hooks/pages so every list query filters by `assigned_to in (workspace_member_ids)` OR `user_id = workspace_owner_id` depending on table:
- `leads`, `listings`, `messages`, `chat_history`, `approval_queue`, `interaction_activity_log`, `homely_push_log`, `media_library`.
- Implementation: small `scopedQuery(table)` wrapper that injects `.eq('assigned_to', workspaceOwnerId)` (or `user_id` for owner-keyed tables).
- Migrate one page at a time starting with LeadCRM, Dashboard, Properties, Inbox; remaining pages keep existing behavior until follow-up.

## 6. Technical notes

- All new UI strictly RTL, Assistant font, blues/whites.
- Modal cards: rounded-xl border, soft shadow, hover ring-primary/20.
- No new external deps.
- Phone normalization continues to use `formatPhone` helper.
- Selector modal mounted globally in `AppLayout` so it can be opened from header avatar menu too (`HeaderProfileMenu` gets a "החלף מרחב עבודה" item).

## 7. Out of scope (explicit)

- Cross-workspace data migration / merging.
- Per-workspace billing isolation.
- Edge-function rewrites (they continue to use service role + the caller's `auth.uid()`); RLS on `workspace_memberships` is the source of truth.
