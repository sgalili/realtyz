# Architecture rules

- Group selection uses one accessible checkbox action per row, immutable deduplicated snapshots and guarded no-op updates; external links are siblings to prevent duplicate activation and render cascades.

- Campaign feed metadata uses one nonwrapping RTL row ordered platform, date, group target, repost and engagement; shrinkable names open full-name popovers, and inline bordered series retain per-target statuses inside their parent to avoid clipping and mobile overflow.
- Campaign selection toolbars use fixed side tracks and a shrinkable scrolling center track so selection controls cannot squeeze the page on narrow screens.
- Posting continuation uses the full campaign composer and an atomic workspace-authorized edited-repost operation; active original jobs block replacement and completed jobs require explicit resubmission.

- Campaign composer topic mode is derived from the active workspace, not the signed-in user; topic selection persists with its workspace-scoped draft and overrides property focus in AI generation.

- Campaign feed refreshes preserve displayed post copy by stable post ID within the active workspace; refresh status/counters independently to prevent background content swaps.
- Campaign cards group by stable series identity regardless of delivery status, sort by immutable creation time with ID tie-breakers, and distinguish comment-only warnings from publication failures.
- Permanent campaign deletion uses a workspace-authorized transaction for posts and queued jobs; native import excludes deletion markers to prevent deleted cards returning.
- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
- Facebook group-post engagement is scraped read-only by the extension (ext-metrics endpoint + pairing-token RPCs); counters only increase and roll up from queue jobs into the campaign card.
- Blocked Facebook groups live on fb_user_groups.is_blocked (auto-set by a queue failure trigger on restriction errors or 3 failures); every selector and queue builder excludes them. Group search/auto-join runs only through the extension in the broker's browser, capped per batch with spaced joins to protect the account.
- Facebook Page post/engagement sync is extension-only (DOM scrape via RZ_FB_PAGE_SCRAPE → fb-recent-posts with posts payload); Graph page reads need App Review, so fb-recent-posts never calls /{page_id}/posts and never prunes from partial scrapes.
