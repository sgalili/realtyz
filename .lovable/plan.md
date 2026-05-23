# Workstream D — Realtyz CRM + Homely Bridge + Freemium Guardrails

Scope: `/crm` (LeadCRM) page + Homely inbound sync scaffold + pencil-icon inline edits + freemium 30d / 100-contact / ₪50 wallet limits. No KalpizAI political logic. `₪` always renders left of digits via existing `PriceTag`/`fmtILS`.

---

## 1. Real-Estate CRM rebuild (`src/pages/LeadCRM.tsx`)

**Filter bar** (sticky, collapsible):
- `deal_type` — multi: `קנייה`, `מכירה`, `שכירות`, `השכרה` (stored as `buy|sell|rent|lease` in `leads.deal_type`)
- `cities` — multi tag picker reading distinct `leads.city` + `leads.preferences->>'city'`
- `budget_min` / `budget_max` — ₪ inputs via `PriceTag` preview
- `rooms_min` / `rooms_max` — numeric stepper
- `lead_score` ≥ slider
- `lead_stage` — multi
- `assigned_to` — broker dropdown
- `source` — multi (homely | manual | whatsapp | web)
- `date_range` — created_at preset (7d/30d/90d/custom)

Filter state is URL-synced (`useSearchParams`) so links are shareable.

**Grid**:
- High-density TanStack-style table (existing patterns). Columns: name, phone, city, deal_type chip, budget range (`PriceTag`), rooms, lead_score, stage, source, last_interaction.
- Multi-select with bulk actions (assign, change stage, push to Homely, delete).
- Row-click → opens existing `LeadProfileSheet` (or `LeadHistoryDrawer` if no full profile).
- **Collapse toggle** in toolbar: switches between full grid and compact 1-line rows (hides secondary cols, smaller row height, no avatar). State persisted in `localStorage('crm.compact')`.

**Inline edits**:
- Replace every `עריכה (הוספה/הסרה)` text link with a small `<Pencil className="h-3.5 w-3.5"/>` ghost button in a `Tooltip`. Applies to tag chips on the row (`interest_tag`, `lead_stage`, `assigned_to`).
- Pencil opens a `Popover` with the right control (combobox / select / multi-tag). Save on blur or Enter.

**Empty state** uses existing `EmptyState`.

---

## 2. Homely live-sync scaffold

**DB migration** (additive only):
- `leads.external_id text` + `leads.external_source text default 'manual'` + unique partial index on `(external_source, external_id) where external_id is not null`.
- New `public.homely_inbound_log` — `id, user_id, payload jsonb, status text, error text, processed_at, created_at`. RLS owner-only read; service role writes.
- New `public.homely_sync_map` — `id, user_id, homely_field text, realtyz_field text, transform text`. Seeded with default mapping (name→full_name, phone→phone_number, email→email, city→city, budget→preferences.budget, rooms→preferences.rooms, deal_type→deal_type).

**Edge function `homely-webhook`** (new, `verify_jwt=false`, HMAC signature header `X-Homely-Signature` checked against `HOMELY_WEBHOOK_SECRET`):
- Validates payload with Zod.
- Looks up `user_id` from `user_api_keys.homely_client_code`.
- Reads `homely_sync_map`, normalizes phones via existing util, upserts into `leads` by `(external_source='homely', external_id)`.
- Writes one row per call to `homely_inbound_log`.
- Returns `202 { received: true }`.

**Edge function `homely-pull-leads`** (stub, scheduled hourly via existing cron pattern): placeholder that logs `not_configured` until real Homely API endpoint is provided. Easy swap when the user shares the endpoint.

**UI** in `ApiSettings` → existing Homely card: add "Webhook URL" read-only field showing `${SUPABASE_URL}/functions/v1/homely-webhook` + copy button + last-sync timestamp from `homely_inbound_log`.

---

## 3. Freemium guardrails (additive — no rebuild of pricing page)

**DB migration**:
- `profiles.trial_end_date timestamptz` (default `created_at + interval '30 days'`).
- `profiles.wallet_balance_agorot int default 5000` (₪50 in agorot, integer-safe).
- Update `handle_new_user()` trigger to set both (idempotent `ON CONFLICT DO NOTHING`).
- Update `enforce_trial_lead_cap()` to also reject when `trial_end_date < now()` with message `TRIAL_TIME_EXPIRED: תקופת ההתנסות הסתיימה - שדרג כדי להמשיך`.

**Frontend hook `useFreemiumStatus.ts`** (new):
- Returns `{ daysLeft, contactsUsed, contactsCap: 100, walletILS, isBlocked, blockReason }`.
- Used by:
  - `LeadCRM` import buttons + "New Lead" CTA: disabled with tooltip when `contactsUsed >= 100`.
  - `Broadcast` / autopilot send paths: throw `trial_quota_exceeded` when `isBlocked`, route user to `/subscription`.
- Trial banner already present is updated to read this hook.

No pricing-card rebuild this workstream — that's the separate freemium plan.

---

## 4. Currency lock

All new ₪ rendering goes through `<PriceTag value={n} />` or `fmtILS()`. Filter inputs show `<PriceTag>` previews, wallet badge in CRM toolbar shows `<PriceTag value={walletILS} />`.

---

## Files touched

- Migration: leads.external_id/external_source + homely_inbound_log + homely_sync_map + profiles.trial_end_date + profiles.wallet_balance_agorot + updated handle_new_user + updated enforce_trial_lead_cap.
- `supabase/functions/homely-webhook/index.ts` (new)
- `supabase/functions/homely-pull-leads/index.ts` (stub, new)
- `src/pages/LeadCRM.tsx` (rebuild filter bar + grid + collapsible + Pencil inline edits)
- `src/components/leads/InlinePencilEdit.tsx` (new shared)
- `src/components/leads/LeadFilters.tsx` (new)
- `src/hooks/useFreemiumStatus.ts` (new)
- `src/pages/ApiSettings.tsx` (Homely webhook URL field)

## Out of scope (separate workstreams)

- Subscription / pricing card redesign (Freemium UI plan).
- Approved-managers role override.
- War Room, Campaign Center port, Managers digest cron.
- Real Homely outbound REST polling (stub only — needs endpoint from user).

Reply **"approve"** to ship, or call out items to drop/reorder.
