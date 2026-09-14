# Authentication and onboarding audit

## Goal
Stop new phone/master-OTP accounts from returning to role selection after choosing broker or partner, while keeping broker and partner access correctly separated. Remove the Facebook connection confirmation toast.

## Changes
- Make role detection reliable for the signed-in user by adding a self-read policy for their own role rows while preserving admin-only management.
- Harden the broker and partner registration functions so one idempotent transaction always creates the base profile, grants the requested role, and creates the affiliate profile when applicable.
- Return and validate explicit success results from role registration instead of treating an RPC response with an error as success.
- Refresh the exact signed-in user's role state before navigation, and keep the role-selection screen visible only after the role check has definitively completed.
- Remove the Facebook connection success toast without suppressing actionable connection errors.

## Validation
- Inspect database constraints, grants, policies, and orphan counts before applying the migration.
- Verify broker selection produces a profile plus broker role and reaches the dashboard.
- Verify partner selection produces a profile, partner role, and affiliate profile, then reaches the partner area without bouncing.
- Check existing users with roles continue through protected pages and role-less users still see role selection.
- Run focused checks and inspect the public authentication page for regressions.

## Technical details
- Apply schema/function/policy changes through a database migration with existing grants preserved.
- Keep roles in `user_roles`; do not move authorization data into profiles or browser storage.
- Use user-scoped query keys and an awaited refetch before redirecting to eliminate stale cached empty-role results.
