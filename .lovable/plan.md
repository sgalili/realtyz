## Workstream C — Broadcast Port into Realtyz

### Scope

Delta-port from KalpizAi `CampaignCenter.tsx` + `SmsBlastSimulator.tsx` into Realtyz. Realtyz already has 90% of these files; this plan covers only the differences. **No new tables created** — uses existing `leads` + `listings` + `dispatch-campaign` edge fn + `get_user_balance` RPC (if absent, falls back to `useFreemiumStatus`).

### 1. `src/pages/CampaignCenter.tsx` — Hero shell

- Read query: `tab`, `lead` (was `voter`), `phone`, `name`, `from` (treat `from=crm` and legacy `from=voter-crm` as same).
- Render a deep-blue gradient hero with a white `RealtyzWave` bottom edge (reuse `<RealtyzWave>`).
- Hero title: `שולחים ל- {name}` only (no phone, no digits). Prepend an `ArrowRight` IconButton that calls `navigate(\`/lead-crm?lead=${leadId}\`)` when `from=crm`.
- Hide the hero (and back-arrow) when no `lead` param is present — keeps default `/campaigns` clean.
- Remove "קמפיין AI" header text, wallet pill, balance badge from this view (they live in `HeaderProfileMenu` and the freemium banner on `/lead-crm`).

### 2. `src/pages/SmsBlastSimulator.tsx` — Broker composer

- `ChannelId` extended to 12: add `messenger | twitter | youtube` (ivr already present). Slot them into the same `CHANNELS` metadata pattern (icon, color, unit price, label).
- Collapse channels 7–12 behind a `"עוד ערוצים"` toggle (Collapsible). First six remain visible.
- Recipient data source: replace any `voters` query with `leads` (`lead_name`, `lead_phone`, `lead_email`, `city`, `preferences`, `lead_stage`). Filter chips swap "מפלגה / קלפי" → `deal_type` (sale/rent) and `city`. Personalization tags become `[שם_פרטי]`, `[עיר]`, `[נכס]` (resolved from `listings.property_title`).
- File parser: keep `.csv/.txt/.xlsx` via `xlsx` lib, validate phone/email per row, cap at 10M rows.
- Dispatch: keep call to edge fn `dispatch-campaign` with `mode: 'test' | 'preflight' | 'campaign'`. Wallet read via `supabase.rpc('get_user_balance', { _user_id })` with try/catch fallback to `useFreemiumStatus().walletBalanceAgorot / 100`.
- WhatsApp payloads: ensure `preview_url: false` is included in the edge-fn body.
- Currency: every ₪ amount rendered via `<PriceTag value={...} />` (₪ stays left).

### 3. Demo Mode override (per user decision)

- `useDemoMode` / `useDemoGuard` re-wired inside `SmsBlastSimulator` only:
  - When `isDemoMode === true`: skip the actual `supabase.functions.invoke('dispatch-campaign', ...)` POST, generate `generateFakeLog()` results, show a sticky banner `"מצב הדגמה — לא נשלחות הודעות אמיתיות"`.
  - When OFF: real dispatch path.
- Update memory: revise core rule + `mem://constraints/no-demo-mode` to scope the "no demo branches" rule to everywhere **except** the broadcast composer.

### 4. Header capsule

- Already implemented as `HeaderProfileMenu` last turn. Verify it pulls `[user name] (agency name)` from `useAuth` + `useWhiteLabel`. No changes unless the format drifts.

### 5. Out of scope / explicit non-changes

- No new tables (no `clients` / `properties_pipeline`).
- No notification webhook changes (18:00 digest already enforced elsewhere).
- No edits to `HeaderProfileMenu`, `AppSidebar`, `NotificationCenter` (already done).
- No changes to `properties_pipeline` references — they don't exist and won't be created.

### Files touched

- `src/pages/CampaignCenter.tsx` — hero block, query-param remap.
- `src/pages/SmsBlastSimulator.tsx` — channel expansion, leads schema, demo branch, collapsible.
- `.lovable/memory/index.md` + `mem://constraints/no-demo-mode` — scope the demo rule.

### Risks

- Demo override conflicts with a long-standing rule. Memory will be updated to reflect the new scope so future sessions don't re-remove it.
- `dispatch-campaign` edge fn must accept all 12 channel IDs; if it currently rejects `messenger/twitter/youtube`, those channels will show as "בפיתוח" disabled until the fn is updated (out of scope here).
