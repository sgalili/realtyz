
## What you'll get

A user clicks an AI-generated post → opens `realtyz.co.il/r/abc123` → resolves to a `wa.me` link with a pre-filled Hebrew intro that includes the property signature → Udi persona greets them, qualifies them as Buyer (קונה) or Renter (שוכר), queries listings dynamically, and when a hot match lands, a `deal_room_matches` row is created and an in-app notification fires for the broker.

## Database (one migration)

**`public.short_urls`** — slug catalog
- `slug` text PK (8-char nanoid)
- `property_id` uuid → `listings(id)` on delete cascade
- `long_url` text (the `wa.me` URL)
- `created_by` uuid (workspace owner)
- `clicks` int default 0
- `created_at` timestamptz
- Public SELECT (needed for anonymous redirect), authenticated INSERT scoped to own listings, service_role ALL.

**`public.deal_room_matches`** — hot-match ledger
- `lead_id` uuid → leads, `listing_id` uuid → listings
- `match_score` numeric, `match_reasons` jsonb, `status` text default 'new'
- `broker_id` uuid (alert recipient = listing owner)
- `created_at`, `acknowledged_at`
- RLS: broker_id = auth.uid() OR admin. Standard GRANTs.

**Trigger**: AFTER INSERT on `deal_room_matches` → inserts a row in `notifications` for the broker with type `deal_room_hot_match` and a Hebrew body referencing the city.

## Edge functions

1. **`shortlink-create`** (authed) — input `{ property_id }`, builds the Hebrew `wa.me` URL using the listing's neighborhood/city/price + the workspace owner's GreenAPI phone (from `user_api_keys`), generates a slug, inserts into `short_urls`, returns `{ slug, short_url }`.

2. **`shortlink-resolve`** (public, no JWT) — input `{ slug }`, returns `{ long_url }` and increments `clicks`.

3. **`greenapi-webhook`** (public, no JWT) — receives GreenAPI inbound. Parses sender phone, matches the pre-written text signature against `short_urls.long_url` to recover `property_id`. If no existing lead for that phone in the listing-owner's workspace, creates one with `deal_type` mirroring listing (sale→Buyer/קונה, rent→Renter/שוכר) and `interest_tag = property_id`. Inserts inbound `messages` row. Then invokes existing `ai-agent` function to draft + send the Udi reply.

4. **`match-and-alert`** (internal, called by `ai-agent` when it detects qualified preferences) — given a lead, runs a SQL match against `listings` using preferences (rooms, budget, city), and if score ≥ threshold, inserts `deal_room_matches` (which fires the notification trigger).

## Frontend

- **`src/pages/ShortLinkRedirect.tsx`** — SPA route at `/r/:slug`, calls `shortlink-resolve`, sets `window.location.href` to the long URL. Minimal RTL loading screen.
- Add route to `src/App.tsx`.
- **Post composer (`CampaignCenter` AI generate flow)** — after AI generates a post and a `property_id` is selected, call `shortlink-create` and append `\n\nדברו איתנו עכשיו: realtyz.co.il/{slug}` to the body before publishing.

## Persona / AI logic (`ai-agent` function)

Add a branch: when the inbound message matches the signature pattern (`לגבי הדירה שפרסמת ב…`), and the lead has a linked `interest_tag` listing, prepend a context block to the system prompt: property summary + "ask 2 short qualifying questions (budget range, must-haves), then offer up to 3 matches from the DB". After capturing prefs to `leads.preferences`, call `match-and-alert`.

## What I will NOT change

- Existing GreenAPI outbound paths, Homely push, autopilot queue.
- Existing Deal Room UI keeps reading from `leads`; `deal_room_matches` is additive ledger surfaced via notification + (next iteration) a tab.
- No new secrets — uses existing GreenAPI credentials in `user_api_keys`.

## Order of operations

1. Migration (short_urls + deal_room_matches + notification trigger).
2. Edge functions: shortlink-create, shortlink-resolve, match-and-alert, greenapi-webhook (or extend existing if present — I'll check before duplicating).
3. SPA redirect page + route.
4. CampaignCenter: append short link on publish.
5. ai-agent: signature parsing + match call.

Reply **go** to proceed, or tell me what to drop/change.
