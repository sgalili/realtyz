# Yad2 scraper: twice-a-day limit + shared market pool

## Goal

Yad2 data is fetched from Bright Data exactly twice a day (08:00 and 18:00 Israel time), only for
listings published since the previous successful run, stored once in a central pool, and then shared
automatically with every workspace whose cities match.

## 1. Central market pool

New shared table `market_listings` — one row per Yad2 ad for the whole system:

- identity: source, external id, listing URL
- content: title, address, city, neighborhood, deal type (sale/rent), price, rooms, size, floor, photos
- timing: published at, first seen, last seen, raw payload

Readable by every signed-in user (public market data), writable only by the system.
Indexed by city + deal type + published date so a workspace read is instant.

New table `market_scrape_runs` — the run log used as the rate-limit gate: one row per source, local
date and slot (morning / evening), with a uniqueness rule that makes a second claim for the same slot
impossible.

New table `market_scrape_state` — per source + city + deal type watermark: the newest published date
already collected, plus last run/success timestamps and counters.

## 2. Rate limiting

- `claim_market_scrape_slot(source, slot)` computes the current Asia/Jerusalem hour and date. It
  claims a slot only when the local hour is 8 (morning) or 18 (evening) and that slot has not been
  claimed today. Everything else returns "denied", so DST needs no special handling.
- `yad2-unlocker` gets a `scrape_token` requirement: without a valid claim it never touches Bright
  Data. Instead it answers from `market_listings` and returns `served_from: "pool"`.
- All existing browser-triggered scrapes are removed: the first-visit seed in `Properties.tsx` and
  the `properties-scheduled-sync` invoke on page load. The page reads the pool and the workspace's
  own listings only.
- `properties-scheduled-sync` becomes the only scrape entry point, claims a slot before doing work,
  and exits quietly when the slot is already used.

## 3. Incremental fetching

For each city + deal type the sync reads the stored watermark and passes it to the scraper. Rows
whose published date is at or before the watermark, or whose external id already exists in
`market_listings`, are dropped before any detail/gallery enrichment, and pagination stops as soon as
a page yields nothing new. After a successful run the watermark advances to the newest published
date seen. This is what keeps credit usage down.

## 4. Sharing across workspaces

After each run, `share_market_listings(since)` copies the new pool rows into the `listings` table of
every workspace whose service areas (or the house default cities) include the listing's city:

- insert only when that workspace has no row with the same source URL
- refresh price, status and photos on rows already shared
- rows are marked as pool-sourced so a workspace's own inventory is never overwritten
- Rita's workspace is skipped (no property features there)

The function runs at the end of the sync, so all matching workspaces see the fresh data in the same
minute with zero extra API calls.

## 5. Schedule

Two pg_cron jobs call `properties-scheduled-sync`, at 05:00 and 15:00 UTC plus 06:00 and 16:00 UTC,
so both winter and summer time hit 08:00/18:00 local; the slot claim guarantees only one run per slot
actually executes. Runs per day: 2 real scrapes, 2 no-op checks.

## 6. UI

The properties page shows when the pool was last refreshed and the next scheduled refresh time.
Manual "refresh from Yad2" actions state that data updates twice daily and simply reload the pool.

## Technical notes

- New migration: 3 tables with GRANTs and RLS, `claim_market_scrape_slot`, `share_market_listings`,
  cron jobs.
- Edited functions: `yad2-unlocker` (gate + watermark + pool write), `properties-scheduled-sync`
  (slot claim, per-city watermark loop, sharing call), `scrape-yad2` (same gate).
- Edited frontend: `src/pages/Properties.tsx` (drop on-load scrapes, read pool),
  `src/lib/propertySearch.ts` (pool as a source), `ListingPortalsCard` (schedule wording).
- Verify with `bunx tsgo --noEmit -p tsconfig.app.json`, a denied out-of-window claim, and a
  simulated run that shares rows into two workspaces.
