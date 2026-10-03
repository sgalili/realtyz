# Architecture rules

- Campaign cards show unframed group names with adjacent static status icons; overflow and series details use a portaled overlay to preserve card geometry.
- Campaign selection toolbars use fixed side tracks and a shrinkable scrolling center track so selection controls cannot squeeze the page on narrow screens.
- Posting continuation uses the full campaign composer and an atomic workspace-authorized edited-repost operation; active original jobs block replacement and completed jobs require explicit resubmission.

- Campaign composer topic mode is derived from the active workspace, not the signed-in user; topic selection persists with its workspace-scoped draft and overrides property focus in AI generation.

- Campaign feed refreshes preserve displayed post copy by stable post ID within the active workspace; refresh status/counters independently to prevent background content swaps.
- Campaign cards group by stable series identity regardless of delivery status, sort by immutable creation time with ID tie-breakers, and distinguish comment-only warnings from publication failures.
- Permanent campaign deletion uses a workspace-authorized transaction for posts and queued jobs; native import excludes deletion markers to prevent deleted cards returning.
- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
