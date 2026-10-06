# Architecture rules
- Inventory suggestions and explicit bulk publication are active-workspace scoped; publication re-reads selected records, preserves commissions and excludes restricted properties.
- Public listing review uses eight single-open accordion forms sharing one draft; pasted URLs replace the input atomically.
- Connections renders Facebook authentication and extension groups as sibling sections; the workspace-scoped groups section stays mounted across section toggles so Page authentication cannot hide groups or interrupt joining.
- Group auto-join indicators follow extension per-group start/result events; workspace-scoped result overlays prevent polling from reversing immediate tab migration before persistence catches up.
- Peer expansions share exclusive group-keyed animated height; nested utilities use separate groups.
- My ads statistics are read through property-authorized RPCs keyed by the active workspace; partners see only their own detailed results on external listings, and raw contact identity is never included.
- Yad2 checks exact workspace records before daily authenticated claims; cache reads preserve edits and source timestamps to avoid sliding freshness. Service-only cache and scheduled feeds never invent/publish on failure. Search dispatch/results share sources; Homely requires verified workspace status, with setup accessible. Counters use completed-search snapshots, not inventory.

- Group selection uses one accessible checkbox action per row, immutable deduplicated snapshots and guarded no-op updates; external links are siblings to prevent duplicate activation and render cascades.

- Campaign feed metadata uses one nonwrapping RTL row ordered platform, date, group target, repost and engagement; shrinkable names open full-name popovers, and inline bordered series retain per-target statuses inside their parent to avoid clipping and mobile overflow.
- Multi-target campaign expansion derives one child per persisted target and reuses the feed card renderer with campaign/group keys; synthetic children never submit campaign-level actions, preventing duplicate queue operations.
- Queue progress and card mirrors share a stable workspace-filtered live subscription with polling fallback; normalize both server payloads and browser job payloads so every active card reflects persisted jobs.
- Campaign selection toolbars use fixed side tracks and a shrinkable scrolling center track so selection controls cannot squeeze the page on narrow screens.
- Posting continuation uses the full campaign composer and an atomic workspace-authorized edited-repost operation; active original jobs block replacement and completed jobs require explicit resubmission.

- Campaign composer topic mode is derived from the active workspace, not the signed-in user; topic selection persists with its workspace-scoped draft and overrides property focus in AI generation.

- Campaign feed refreshes preserve displayed post copy by stable post ID within the active workspace; refresh status/counters independently to prevent background content swaps.
- Campaign cards group by stable series identity regardless of delivery status, sort by immutable creation time with ID tie-breakers, and distinguish comment-only warnings from publication failures.
- Permanent campaign deletion uses a workspace-authorized transaction for posts and queued jobs; native import excludes deletion markers to prevent deleted cards returning.
- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
- Facebook group-post engagement is scraped read-only by the extension (ext-metrics endpoint + pairing-token RPCs); counters only increase and roll up from queue jobs into the campaign card.
- Blocked Facebook groups live on fb_user_groups.is_blocked: confirmed post rejection blocks immediately, while transient failures retain the three-failure safeguard; normalized workspace-scoped database guards stop queue inserts/retries, cancel remaining jobs, and require an authorized extension preflight before every send so stale browser queues cannot bypass manual-unblock-only exclusion. Pending approval and comment-only warnings are not post rejection. Group search/auto-join runs only through the extension in the broker's browser, capped per batch with spaced joins to protect the account.
- Facebook Page sync strategy is stored on the workspace's own Page binding, never inherited from shared bindings; server-authorized configuration routes Graph or extension reads, rejects foreign workspace/Page payloads, and never prunes partial scrapes. Extension delivery is correlated by request, workspace, Page and originating app tab; scrape tabs close only after web-app receipt acknowledgement persisted in chrome.storage.local.
