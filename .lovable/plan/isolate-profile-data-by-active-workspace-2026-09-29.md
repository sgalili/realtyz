# Isolate profile data by active workspace

## Outcome
When Udi switches into Rita's workspace, every workspace-level profile tab will load Rita's workspace data and never Udi's personal or cached data.

## Changes
- Make the Profile tab read and save the active workspace owner's profile, resetting immediately during workspace changes.
- Scope profile photos and locally cached profile fields by active workspace, with workspace-member access enforced in the database.
- Remove account-level Facebook fallback from the workspace Connections view so another tenant's Page cannot appear.
- Scope manager settings to the active workspace owner.
- Audit billing/referral surfaces and label or scope account-only data so it cannot masquerade as Rita workspace data.
- Verify the Rita workspace in a signed-in browser session across all Profile tabs and check the current build/error logs.

## Technical details
- Use `activeWorkspaceId` as the tenant key and `user.id` only as an authentication identity.
- Add narrowly scoped profile/avatar access rules for active workspace members; no public access.
- Key all profile queries and caches by workspace owner ID and clear prior state before fetching the next workspace.
