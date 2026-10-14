# Architecture rules
- Cloud monitoring mounts only for authenticated super_admin roles and its read-only endpoint rechecks user_roles server-side; queue counts resolve and authorize the active workspace, while Railway heartbeat and scheduler ticks remain separate. Why: prevent operational data leaks and false readiness.
- Wallet usage pricing is read-only and loaded from action_pricing on opening its hero dialog; reuse the admin query key without exposing editing controls. Why: display current configured costs consistently.
- Profile and office image uploads use the shared fixed-aspect crop dialog before storage; crop percentages map to original pixels and pending selections clear on workspace changes. Why: consistent image framing without premature uploads or tenant drift.
- Tours use authorized menus and route-stable state; never auto-mutate.
- Public ads use shared headings/publishers/public cache, never private profiles; container-width layouts.
- Inventory/history/publication are workspace-scoped; reload on entry/focus, retain partial imports/commissions; DB-authorize publication.
- Drafts retain user/workspace steps/errors; explicit publish, member defaults. Celebration owns canvas/audio.
- Publisher numbering excludes setup, preserves saved keys; resolved addresses reveal details; stale searches cannot overwrite selections.
- Facebook auth/groups are mounted siblings, so Page state cannot interrupt groups/joining.
- Joining indicators follow extension events; workspace overlays stop polling reversing tab migration before persistence.
- Peer expansions use exclusive motion groups to avoid hover leaks.
- Inquiry tiers need server-only workspace/listing identity and satisfactory screening; first turns/callbacks never qualify. Atomic upgrades charge only unpaid differences.
- Tables share sort/reorder/hide with visible grips and order-only reset; prefs never store listings. Native scrolling, no overlays. Why: consistency.
- My Ads stats use workspace-authorized RPCs; favorites are user-scoped, paginated and public-safe.
- Yad2 checks exact workspace records before daily claims; cache reads keep edits and source timestamps (no sliding freshness). Cache/scheduled feeds never invent/publish on failure. Search dispatch/results share sources; Homely needs verified workspace status. Counters use completed-search snapshots.
- Yad2 keeps original publisher snapshots, source buckets and scoped DOM evidence; never null-overwrites or classifies from related ads; license needs evidence.
- Group selection uses one checkbox per row, immutable deduplicated snapshots and no-op guards.
- Post media dedup matches original host/path hashes to cached filenames; mirrors and sources are one asset.
- Multi-select lists use the shared controls in src/components/ui/multi-select-controls.tsx so every page behaves the same.
- Partner rewards freeze into immutable listing_reward_snapshots on pick; charges use the snapshot. Trust scores are server-computed (compute_trust_score), super_admin-overridable, audited.
- Listing lifecycle advances forward-only via advance_listing_stage; daily cron pauses partner distribution after 3 unanswered checks until confirm_listing_availability.
- Lead disputes, appeals and bans run only through audited security-definer RPCs; appeals need a neutral reviewer; bans freeze, never delete.
- Lead categories come from generated `leads.lead_category` (lead_kind → interest_tag → deal_type); filters, counts and badges read it. Why: legacy leads stored type only in interest_tag.
- Core identity survives partner membership; RPC-only profile consent gates entry. Mode grants no roles.
- Developer editors preserve source JSON in scoped eight-step forms; confirm saves, never publishes.
- Wallet lock: credit_wallets trigger locks at balance<=0; ProtectedRoute sends locked non-superadmins to /wallet. Why: billing state lives in DB.
- payment_methods.provider_token is never client-granted; only provider backends insert cards.
- Personal links use auth RPCs; service attribution validates listing/workspace.
- Roles come only from user_roles; partner reads use server-redacted RPCs and verified-license guards.

<!-- LOVABLE:BEGIN -->
- Personal invite bonuses are account-scoped and atomic on evidence-verified first-deal approval, never signup or subscription. Why: prevent fake and duplicate rewards.
<!-- LOVABLE:END -->

- Affiliate pricing rules: see src/components/affiliate/AGENTS.md.
- Facebook extension/group rules: see extension/AGENTS.md.
- Closing splits: compute_closing_split pays 80% to authorized brokers (partner_can_view_closing) via idempotent paid_amount delta; otherwise platform retains 100%. No subscription plans; billing is credits only. Why: legal license model.
- Facebook group pool: fb_rebalance_group_pool keeps ≤100 active groups (pool_status), posts set a 24h cooldown to waiting, blocked groups never auto-return; campaign targets read only active. Why: server-owned rotation.
