---
name: Yad2 scraping rate limit and shared market pool
description: Bright Data / Yad2 may only be scraped twice a day (08:00 and 18:00 Asia/Jerusalem) via properties-scheduled-sync; all other reads come from the shared market_listings pool.
type: constraint
---

HARD: Bright Data (Yad2) is scraped exactly twice per day — 08:00 and 18:00 Asia/Jerusalem. Never add another scrape trigger.

- Only entry point: `properties-scheduled-sync`, which must claim a slot via `claim_market_scrape_slot('yad2')` and close it with `finish_market_scrape_run(token, ...)`. Cron jobs `yad2-market-sync-morning` (0 5,6 UTC) and `yad2-market-sync-evening` (0 15,16 UTC) cover both DST offsets; the claim rejects the extra hour with `outside_window` / `already_claimed`.
- `yad2-unlocker` and `scrape-yad2` refuse external calls without a valid `scrape_token` of a running run. `yad2-unlocker` then answers from the pool (`served_from: 'pool'`, `rate_limited: true`); `scrape-yad2` returns 429.
- Incremental only: `market_scrape_state` (source, city, deal_type) holds `watermark_published_at`. The scheduled run passes `since`; the scraper drops ads at/before the watermark and ads whose `external_id` is already pooled BEFORE enrichment.
- Sharing: `market_listings` is the system-wide pool (public SELECT, service_role write). It IS the sharing layer — do NOT copy pool rows into per-workspace `listings`, because `listings.source_url` is globally unique (trigger `prevent_duplicate_listing_source_url`). Frontend reads it with `searchMarketPool()` in `src/lib/propertySearch.ts`, merged into the Properties default pool for the workspace's cities.
- Never scrape on page load, first visit, or user search. Properties.tsx must not invoke `yad2-unlocker`/`properties-scheduled-sync`/`homely-daily-sync` from the browser.
