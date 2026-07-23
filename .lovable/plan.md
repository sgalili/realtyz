# Unified Property Search Overhaul

Refactors `/properties` into a single global search across every connected source and rewires the "Add New Post" property picker to the same engine, with silent auto-import on selection.

## 1. `/properties` page (`src/pages/Properties.tsx`)

- Delete `SourceTab` state and the entire tab strip (`הכל / הנכסים שלי / הומלי / יד-2 / מדל״ן`). Delete the separate Yad2 URL box and Madlan link box.
- Add **one unified search bar** at the top: single text input (city / address / free text / pasted Yad2 or Madlan URL) + the existing filter set (Sale/Rent tabs, city, rooms, price slider, area, property type) — filters apply to every source at once.
- Default state on load: **empty state** ("חפש נכס מכל המקורות...") — no auto-fetched local rows. Only after the user types/submits do we run searches. Cache last query in `sessionStorage` so returning to the page restores results.
- On submit, fan out in parallel:
  - Local DB (`listings` table)
  - Homely (`homely-search` edge fn)
  - Yad2 (`yad2-unlocker` in search-URL / free-text mode)
  - Webtiv (`webtiv-homely-sync` search path — read-only)
  - Madlan (`madlan-search` edge fn)
  - Merge into one deduped result set. Failed sources degrade silently with a small inline chip ("יד-2 לא זמין כרגע").
- Each row/card gets a **source badge** (icon + label) — local (`Home`), Homely (`H`), Yad2 (`Y2`), Webtiv (`W`), Madlan (`M`). Small colored pill on the right/top of every row.
- **Auto-import on click**: clicking any external result kicks off `supabase.functions.invoke('yad2-unlocker' | 'homely-fetch-property' | 'webtiv-homely-sync' | 'madlan-fetch')` in the background with full data + images, upserts into `listings`, then navigates to the resulting `/properties/:id`. A subtle toast confirms ("יובא אוטומטית"). Local rows navigate directly.
- View toggle: keep the grid/table buttons but **remove the "טבלה" / "כרטיסיות" text** — icon-only (`LayoutGrid`, `FileSpreadsheet`), keep `title` attributes for a11y.

## 2. Add New Post property picker

- Replace the property `Select` in the composer with a new `UnifiedPropertyPicker` component (Command palette / combobox).
- Typing triggers the same multi-source search (debounced 300ms).
- Results grouped by source with the same badges. Selecting an external result:
  1. Awaits the auto-import function.
  2. Waits for the resulting local `listings.id`.
  3. Sets it as the selected property and immediately kicks off post + first-comment generation via the existing `generate-content` flow.
- Local results skip step 1-2 and go straight to generation.

## 3. Shared building blocks (new)

- `src/lib/propertySearch.ts` — `searchAllSources({ q, filters })` returns a normalized `UnifiedResult[]` with `{ id, source, title, city, price, rooms, sqm, thumbnail, raw, importer }`.
- `src/lib/propertyAutoImport.ts` — `autoImportResult(result)` dispatches to the correct edge function per `source` and returns the local `listings.id`.
- `src/components/properties/SourceBadge.tsx` — icon + short label.
- `src/components/properties/UnifiedPropertyPicker.tsx` — combobox used by the post composer.

## 4. Cleanup

- Remove Yad2 URL scrape box, Madlan quick-link box, source tabs, and any code paths that hinge on `sourceTab`.
- Preserve `AddPropertyDialog` / `ManualPropertyDialog` / `ImportPropertiesDialog` / `HomelyBulkSyncDialog` (still triggered from the hero `+` menu).

## Technical notes

- No DB schema changes. Uses existing edge functions (`homely-search`, `yad2-unlocker`, `madlan-search`, `webtiv-homely-sync`, `homely-fetch-property`).
- Dedupe by `city + address + rooms + price` (existing `propertyDedupeKey` helper).
- Auto-import runs behind an inline spinner on the clicked row; on failure shows a Hebrew toast and does not navigate.
- Session cache keyed as `properties:last-search:v1`.

## Out of scope

- New scraping backends beyond what's already deployed.
- Changes to the property detail page rendering.
