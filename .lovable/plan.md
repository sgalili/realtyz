# Campaign group cards and live progress

## Changes
- Show reliable live progress on every active campaign card, with instant counter refresh after queue changes and polling as a fallback.
- Replace published-status circles with bold green checkmarks and pending clocks with send-clock icons.
- Expand the group counter into full individual post cards below the main card, one per target group, retaining images, content, timestamps, statuses and existing actions.

## Safeguards and verification
- Keep workspace isolation, completed-group deduplication and explicit resume/publication actions unchanged.
- Verify expansion/collapse on the signed-in campaign page and run regression tests for status icons and progress updates.
- Do not publish or resume any Facebook posts during verification.

## Technical details
- Reuse the existing campaign card renderer for group children, keyed by campaign and group identity.
- Keep the shared workspace queue subscription stable; scope cache invalidation and live events to that workspace.