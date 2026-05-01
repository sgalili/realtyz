---
name: Demo Mode (Context Switcher)
description: Demo mode is a client-side context flag (no auth swap, no separate user, no secrets). Super-admin only toggle in header.
type: feature
---
**Architecture**: Demo Mode is a pure client-side context, NOT a separate auth user.

- `useDemoMode()` provides `isDemoMode` (persisted in localStorage `realtyz-demo-mode`).
- `DemoModeProvider` wraps the app in `App.tsx`.
- Toggle component: `src/components/DemoModeToggle.tsx`, mounted in the global header. Visible only when `useUserRole().isSuperAdmin`.
- When toggled, `queryClient.invalidateQueries()` is called so all queries refetch and demo/real datasets swap immediately.
- Components branch on `if (isDemoMode)` to read from `src/lib/demoData.ts` instead of Supabase.
- No edge function, no `DEMO_USER_*` secrets, no session swap. The user's real auth session stays intact.
- Cross-tab sync via the `storage` event.

**Do NOT**:
- Add a separate `demo@realtyz.local` auth user.
- Request `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` secrets.
- Show the toggle to non-super-admins.
