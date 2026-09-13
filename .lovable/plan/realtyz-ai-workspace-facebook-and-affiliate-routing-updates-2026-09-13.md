# Realtyz AI+ workspace, Facebook, and affiliate routing updates

## Scope
- Center the rotating landing text and remove the divider above "כל מה שמתווך צריך".
- Place the text-only broker/affiliate mode switch beside the Guide action at the top of the sidebar.
- Use one Flowchart symbol for affiliate/partner navigation and controls throughout the app.
- Make workspace selection open immediately, close the sidebar, and refresh all workspace-scoped information.
- Correct Facebook permission detection and load every post page using Graph cursor pagination.
- Route new affiliate onboarding conversations into Rita’s managed context and the inviting broker’s context with explicit access controls.

## Implementation approach
1. Update existing landing and sidebar components without changing unrelated layout.
2. Centralize the affiliate icon and workspace-change refresh behavior so all screens behave consistently.
3. Keep data queries keyed or filtered by active workspace, clear stale workspace data before refetching, and reject unauthorized workspace reads.
4. Treat Meta permission warnings only as confirmed token/scope failures; continue cursor pagination until no `after` cursor remains or the safety limit is reached.
5. Add explicit relationship records for affiliate onboarding visibility rather than copying or broadly exposing tenant data. Rita and the inviter receive access only to the linked onboarding thread and lead.

## Technical details
- Reuse the existing workspace RPC and React Query cache, invalidating/removing workspace-sensitive queries after a successful switch.
- Preserve strict database policies; shared affiliate visibility will be relationship-based and limited to intended records.
- Apply schema changes through a migration, then update generated-query call sites and edge functions together.
- Verify sidebar behavior, landing layout, workspace switching, Facebook sync/error states, and affiliate signup routing.

## Acceptance checks
- Rotating text is centered and the requested divider is absent.
- The mode switch is text-only beside Guide; all affiliate icons use Flowchart.
- Switching workspaces closes the sidebar and no previous-workspace counters or rows remain visible.
- A valid Facebook Page connection shows no false permission banner and older posts paginate into the campaign list.
- New affiliate chats appear only for Rita, the inviting broker, and authorized participants.
