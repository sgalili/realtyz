# Realtyz Premium Overhaul + Full Kalpiz Engine Port

Compilation on hold. This expanded plan covers the global shell **and** ports the heavy machinery (Campaign Center, CRM database, automations) from Kalpiz, rebranded to broker vocabulary.

---

## Workstream A — Shell, Sidebar, Profile Capsule

**Files:** `src/components/AppSidebar.tsx`, `src/components/AppLayout.tsx`, new `src/components/sidebar/ProfileCapsule.tsx`

- Remove from main sidebar matrix: `הפרופיל שלי`, `ניהול חבילה` (`/subscription`), `חשבוניות ותשלומים` (`/finance`).
- Build `ProfileCapsule` pinned to `SidebarFooter`: avatar + display name + chevron, opens Radix Popover with three actions → `/profile`, `/subscription`, `/finance`. Logout action included.
- Minimal high-contrast nav: thin dividers, single accent, no decorative emoji icons in group labels.
- Header app-name lock → "Realtyz AI" (read from `useWhiteLabel()` with that as default).

## Workstream B — War Room ("חדר מלחמה ועסקאות")

**Files:** new `src/pages/WarRoom.tsx`, `src/components/warroom/{RadarTab,GeoPulseTab,SegmentationTab,MediaSlicesTab}.tsx`, route `/war-room` (and link from dashboard).

4 RTL tabs:
1. **מכ"ם נכסים** — matrix: rows = high-intent leads (lead_score desc), cols = property class (rooms × deal_type × city band). Cell click → DealRoom filtered.
2. **דופק גיאוגרפי** — Recharts bar/heat per city from `leads.preferences.city` ∩ `listings.city`, sentiment overlay from `leads.sentiment`.
3. **פילוח דמוגרפי** — budget brackets, family context, requirements stacked bars from `leads.preferences`.
4. **פלחי מדיה** — AI voice call telemetry vs inbound WhatsApp streams (`messages` + `interaction_activity_log`).

## Workstream C — Full Campaign Center Port ("מרכז הקמפיינים")

**Current:** `src/pages/CampaignCenter.tsx` already has the 5-tab shell. Port the missing dispatch engine + queue UI.

**Files:**
- Refit `src/pages/CampaignManager.tsx` → "קמפיין נכסים חמים" card list (active/scheduled/draft), per-card metrics (reach, replies, conversions), launch/pause/duplicate actions.
- New `src/components/campaigns/DispatchQueueCard.tsx` — shows pending `autopilot_queue` items + `campaign_logs` recent dispatches, retry / cancel.
- New `src/components/campaigns/AutomationFlowCard.tsx` — "אוטומציות שיווק ללידים" list: trigger (new lead / stage change / property match) → action (WhatsApp / SMS / email / AI nudge). Toggle active.
- Rewrite vocab on `CampaignStrategy.tsx`, `SmsBlastSimulator.tsx`, `CommunityBroadcastPanel.tsx`:
  - "IVR / הודעה קולית" → removed (real-estate has no IVR).
  - Audience labels → "קונים", "שוכרים", "מתעניינים בעיר X".
  - Campaign types → "קמפיין נכסים חמים", "הפצה לקונים/שוכרים", "ניוזלטר שוק".

**Edge function:** `dispatch-campaign` (port pattern from Kalpiz) — reads campaign row, expands recipients via `leads` filters, enqueues into `autopilot_queue` with channel + template. Existing `autopilot-queue-drain` already handles sending.

**Schema additions (migration):**
- `campaigns` table: extend (if missing) with `campaign_type` (`hot_property|buyers_blast|renters_blast|newsletter|automation`), `target_filters` (jsonb), `template_id`, `status`, `scheduled_for`, `metrics` (jsonb).
- `marketing_automations` table: `trigger_type`, `trigger_config` (jsonb), `action_type`, `action_config` (jsonb), `is_active`, `last_run_at`.
- RLS: owner-only (`auth.uid() = user_id`).

## Workstream D — Full CRM Database Port ("מאגר לקוחות פוטנציאליים / מחפשי דירות")

**Current:** `src/pages/LeadCRM.tsx` exists but lighter than Kalpiz. Port full grid + filters + drawer.

**Files:**
- Rebuild `LeadCRM.tsx` with:
  - Advanced filter bar: deal_type (sale/rent), budget range slider, target cities multi-select, rooms range, lead_stage, lead_score range, channel source, date range.
  - High-density grid (existing pattern): name, phone, deal_type chip, budget, target cities, rooms, score, sentiment, last_contact, owner_agent.
  - Inline metadata tags editor (rooms, must-haves) — writes to `leads.preferences`.
  - Multi-select bulk: assign agent, bulk WhatsApp, bulk add to campaign, bulk export.
- New `src/components/leads/LeadHistoryDrawer.tsx` — communication history timeline (messages, calls, emails, automation events, manual notes) from `messages` + `interaction_activity_log` + `chat_history`. Reuses existing `VoterProfileSidebar` patterns, renamed/refactored to `LeadProfileSidebar`.

**Data bridge for Homely sync (template, not active):**
- `homely_sync_map` table: `lead_id`, `homely_client_id`, `last_synced_at`, `sync_direction` (`pull|push|bidirectional`), `field_map` (jsonb).
- `homely_sync_log` table: per-event log.
- Empty edge function stub `homely-sync-leads` with TODO scaffold so future API key wiring is a config-only change.

## Workstream E — Approved Managers + Digest

**Schema (migration):**
- `approved_managers`: `id`, `user_id` (owner broker), `full_name`, `phone`, `gender` (`male|female|neutral`), `role_label`, `is_active`, timestamps. RLS owner-only.
- `manager_digest_log`: `user_id`, `sent_at`, `summary_text`, `match_count`, `completion_count`.

**Edge function:** `managers-daily-digest` — scheduled 18:00 Asia/Jerusalem via `pg_cron` + `pg_net`. Aggregates today's platform matches + broker completions per owner, formats single WhatsApp text, sends via WhatsApp gateway, logs row.

**UI:** new `src/pages/ApprovedManagers.tsx` route `/managers`:
- Manager CRUD table.
- "הודעה קבוצתית למורשים" modal with template textarea, variable chips `[שם פרטי]`, `[זמין/ה]`, `[יכול/ה]`. On send, per-recipient render replaces slash forms based on `gender`:
  - male → `זמין`, `יכול`
  - female → `זמינה`, `יכולה`
  - neutral → keeps `/` form.
- Real-time per-event notifications to managers suppressed: matches + completions write to `pending_digest` queue, not push.

## Workstream F — Vocabulary Lock + Currency

- Sweep remaining political/Sharren references project-wide:
  - "שרן הסכל", "מצביע", "בוחר", "מפלגה", "בחירות", "מנדט", "סקר" → `מתווך`, `לקוח קצה`, `נכס למכירה`, `נכס להשכרה`, `קונה`, `שוכר`.
  - Update `useElectionType` terms map + `mem://ai/personality-style` derived prompts (broker tone, not political).
- New `src/lib/formatCurrency.ts`:
  ```ts
  export const fmtILS = (n: number) =>
    `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
  ```
  Render with `<bdi dir="ltr">{fmtILS(n)}</bdi>` so `₪` is always **left** of the digits in RTL flow.
- Replace inline price formatting in: `Finance.tsx`, `BusinessPerformance.tsx`, `Properties.tsx`, `PropertyDetail.tsx`, `DealRoom.tsx`, `CommissionEditor.tsx`, `SubscriptionManager.tsx`, `Upgrade.tsx`, `Broadcast.tsx`, `LeadCRM.tsx` (budget cells), `WarRoom` segmentation tab.

## Workstream G — Page-Level Visual Replication

For every primary page (Dashboard, Inbox, DealRoom, Properties, CRM, Campaigns, War Room, Activity Log, Settings):
- Apply consistent `PageHero` + `PageToolbar` pattern already in repo.
- Card surfaces: `border border-border/60 bg-background`, single subtle shadow, 8px radius.
- Section spacing tokens normalized (`space-y-6`, padded `p-6`).
- No emojis in section titles; lucide-react icons only, size 16, accent color tokens.
- Tables: sticky header, zebra off, hover row, compact density.

---

## Execution Order (once approved)

1. **F** — Vocabulary + currency helper (low-risk groundwork).
2. **A** — Sidebar + Profile Capsule.
3. **D** — CRM database port (highest user value).
4. **C** — Campaign Center port + dispatch engine.
5. **E** — Approved Managers + 18:00 digest cron.
6. **B** — War Room.
7. **G** — Per-page visual polish pass.

Each workstream ships as its own batch with migration → code → verify.

## Out of Scope

- Activating live Homely API sync (schema + stub only; API key wiring deferred).
- Backfilling historical campaign metrics or digests.
- Migrating Kalpiz political AI persona prompts; broker persona stays as-is.
- Rebuilding inbox/KB UIs beyond consistency tokens.

---

**Approve to begin execution starting at Workstream F**, or tell me to reorder / drop any block.