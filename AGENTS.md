# Architecture rules
- Public ads share title/publisher UI and public endpoint cache; never read private profiles for cards.
- Inventory/history/publication are workspace-scoped; reload on entry/focus, retain partial imports and commissions; authorize publication in DB.
- Drafts retain user/workspace steps/errors; explicit publish, current-member broker defaults. Celebration owns canvas/audio.
- Publisher numbering excludes setup, preserves saved keys; resolved addresses reveal details; stale searches cannot overwrite selections.
- Facebook auth/groups are mounted siblings, so Page state cannot interrupt groups/joining.
- Joining indicators follow extension events; workspace overlays stop polling reversing tab migration before persistence.
- Peer expansions use exclusive group-keyed motion; nested utilities use separate groups.
- Inquiry tiers require server-only workspace/listing identity and satisfactory screening evidence; first turns/callbacks never qualify screening. Atomic upgrades charge only unpaid differences to prevent duplicates.
- Tables use the shared Table primitive for sort/reorder/hide (user/workspace/page-keyed local prefs, never listing data) with native horizontal scrolling and no arrow overlays, so behavior is identical everywhere.
- My Ads stats use workspace-authorized RPCs; favorites are user-scoped, paginated and public-safe, preventing private inventory/contact exposure.
- Yad2 checks exact workspace records before daily authenticated claims; cache reads preserve edits and source timestamps to avoid sliding freshness. Service-only cache and scheduled feeds never invent/publish on failure. Search dispatch/results share sources; Homely requires verified workspace status, with setup accessible. Counters use completed-search snapshots, not inventory.

- Group selection uses one checkbox per row, immutable deduplicated snapshots and no-op guards; sibling links prevent duplicate activation/cascades.

- Campaign feed metadata uses one nonwrapping RTL row ordered platform, date, group target, repost and engagement; shrinkable names open full-name popovers, and inline bordered series retain per-target statuses inside their parent.
- Multi-target campaign expansion derives one child per persisted target and reuses the feed card renderer with campaign/group keys; synthetic children never submit campaign-level actions.
- Queue progress and card mirrors share a stable workspace-filtered live subscription with polling fallback; normalize both server payloads and browser job payloads so every active card reflects persisted jobs.
- Campaign selection toolbars use fixed side tracks and a shrinkable scrolling center track so selection controls cannot squeeze the page on narrow screens.
- Posting continuation uses full composer and atomic workspace-authorized edited-repost; active jobs block replacement, completed jobs need explicit resubmission.

- Composer topic mode uses the active workspace; workspace drafts retain topics overriding property focus in AI generation.

- Campaign feed refreshes preserve displayed post copy by stable post ID within the active workspace; refresh status/counters independently to prevent background content swaps.
- Campaign cards group by stable series identity regardless of delivery status, sort by immutable creation time with ID tie-breakers, and distinguish comment-only warnings from publication failures.
- Permanent campaign deletion uses a workspace-authorized transaction for posts and queued jobs; native import excludes deletion markers to prevent deleted cards returning.
- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
- Facebook group-post engagement is scraped read-only by the extension (ext-metrics endpoint + pairing-token RPCs); counters only increase and roll up from queue jobs into the campaign card.
- Blocked Facebook groups live on fb_user_groups.is_blocked: confirmed post rejection blocks immediately, while transient failures retain the three-failure safeguard; normalized workspace-scoped database guards stop queue inserts/retries, cancel remaining jobs, and require an authorized extension preflight before every send so stale browser queues cannot bypass manual-unblock-only exclusion. Pending approval and comment-only warnings are not post rejection. Group search/auto-join runs only through the extension in the broker's browser, capped per batch with spaced joins to protect the account.
- Facebook Page sync strategy is stored on the workspace's own Page binding, never inherited from shared bindings; server-authorized configuration routes Graph or extension reads, rejects foreign workspace/Page payloads, and never prunes partial scrapes. Extension delivery is correlated by request, workspace, Page and originating app tab; scrape tabs close only after web-app receipt acknowledgement persisted in chrome.storage.local.
