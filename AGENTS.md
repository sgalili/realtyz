# Architecture rules
- Public ads share headings/publishers/public cache, never private profiles; layouts use container width.
- Inventory/history/publication are workspace-scoped; reload on entry/focus, retain partial imports and commissions; authorize publication in DB.
- Drafts retain user/workspace steps/errors; explicit publish, current-member broker defaults. Celebration owns canvas/audio.
- Publisher numbering excludes setup, preserves saved keys; resolved addresses reveal details; stale searches cannot overwrite selections.
- Facebook auth/groups are mounted siblings, so Page state cannot interrupt groups/joining.
- Joining indicators follow extension events; workspace overlays stop polling reversing tab migration before persistence.
- Peer expansions use exclusive group-keyed motion; nested utilities use separate groups.
- Inquiry tiers require server-only workspace/listing identity and satisfactory screening evidence; first turns/callbacks never qualify screening. Atomic upgrades charge only unpaid differences to prevent duplicates.
- Tables share the Table primitive for sort/reorder/hide; user/workspace/page-keyed local prefs never store listings. Use native horizontal scrolling without arrow overlays.
- My Ads stats use workspace-authorized RPCs; favorites are user-scoped, paginated and public-safe, preventing private inventory/contact exposure.
- Yad2 checks exact workspace records before daily authenticated claims; cache reads preserve edits and source timestamps to avoid sliding freshness. Service-only cache and scheduled feeds never invent/publish on failure. Search dispatch/results share sources; Homely requires verified workspace status, with setup accessible. Counters use completed-search snapshots, not inventory.

- Group selection uses one checkbox per row, immutable deduplicated snapshots and no-op guards; sibling links prevent duplicate activation/cascades.



- Post media deduplication matches original host/path hashes to cached filenames; mirrors and source URLs represent one asset, not separate gallery items.- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx (list-icon toggle, select-all, counter shown only when count > 0) so every page behaves the same.
- Facebook group-post engagement is scraped read-only by the extension (ext-metrics endpoint + pairing-token RPCs); counters only increase and roll up from queue jobs into the campaign card.
- fb_user_groups.is_blocked requires manual unblock: confirmed rejection blocks immediately; transient failures use the three-failure safeguard. Normalized workspace DB guards reject inserts/retries, cancel remaining jobs and require authorized extension preflight on every send, preventing stale-queue bypass. Pending approval/comment warnings are not rejection. Group search/join is extension-only in the broker browser, with capped, spaced batches for account safety.
- Page sync strategy belongs to the workspace's own binding, never shared bindings. Server-authorized Graph/extension routing rejects foreign workspace/Page payloads and never prunes partial scrapes. Delivery correlates request/workspace/Page/originating app tab; scrape tabs close only after app receipt ACK persists in chrome.storage.local.

- Yad2 preserves original publisher snapshots, source buckets and scoped DOM evidence, never null-overwrites or classifies from related ads; inspect gallery logos before removal and require license evidence.
- Partner rewards freeze into immutable listing_reward_snapshots when a partner picks a listing; charging uses the snapshot so later commission edits only apply forward. Trust scores are computed server-side (compute_trust_score), mirrored to profiles/affiliate_profiles, overridable only by super_admin, and every change is written to audit_logs.
- Listing lifecycle advances forward-only via DB triggers (advance_listing_stage); a daily cron prompts idle advertisers and pauses partner distribution after 3 unanswered checks, resumed only by confirm_listing_availability.
