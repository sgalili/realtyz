# Architecture rules

- Group-pill expansion uses a portaled overlay, including series children, to keep card geometry unchanged.
- Posting continuation resets only workspace-authorized original queue jobs atomically; active jobs are skipped and completed jobs require explicit resubmission.

- Campaign composer topic mode is derived from the active workspace, not the signed-in user; topic selection persists with its workspace-scoped draft and overrides property focus in AI generation.

- Campaign feed refreshes preserve displayed post copy by stable post ID within the active workspace; refresh status/counters independently to prevent background content swaps.
- Campaign cards group by stable series identity regardless of delivery status, sort by immutable creation time with ID tie-breakers, and distinguish comment-only warnings from publication failures.
- Permanent campaign deletion uses a workspace-authorized transaction for posts and queued jobs; native import excludes deletion markers to prevent deleted cards returning.
- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
