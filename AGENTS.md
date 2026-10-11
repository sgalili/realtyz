# Architecture rules
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
- FB group-post engagement is scraped read-only by the extension (ext-metrics + pairing-token RPCs); counters only increase and roll up into the campaign card.
- fb_user_groups.is_blocked needs manual unblock: confirmed rejection blocks immediately; transient failures use a three-failure safeguard. DB guards reject inserts/retries, cancel remaining jobs, and require extension preflight per send. Pending approval is not rejection. Group search/join is extension-only, capped and spaced.
- Page sync uses the workspace's own binding. Server routing rejects foreign workspace/Page payloads and never prunes partial scrapes; scrape tabs close only after app receipt ACK persists.
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
