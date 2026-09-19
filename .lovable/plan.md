# Realtyz AI — Header, Public Board, Affiliate Pricing Page & Yad2-Style Listing Wizard

## 1. Header centering
- In `AppLayout.tsx`, the identity block (logo + workspace name + full name) is already absolutely positioned; tighten it to true screen center by anchoring it to the viewport width rather than the header content box, and reduce the gap between the two text lines so the block height stays within the logo height.
- Keep RTL order: burger far right, identity centered, Rita far left, no profile picture.

## 2. New page: חבילות שותפים (`/affiliate-pricing`)
- Move the plans panel and touch-point calculator out of `AffiliatePortal` into a new page `src/pages/AffiliatePricing.tsx`, add the route, and link to it from the affiliate area.
- Hero/page title on this route: "חבילות שותפים" (title registered in `PageHero.tsx` / `PageToolbar.tsx`).
- Remove the in-panel heading "חבילות שותפים" and the line "המחירים מוצגים לצורך בחירת החבילה. לא מתבצעת גבייה."
- Billing toggle: remove "· חודשיים מתנה"; center the חודשי / שנתי buttons.
- Plan cards: remove the card name row (חינם / 100 / 1,000 / 2,000); show price and `/לחודש` or `/לשנה` inline on the same row.
- Plan selection keeps saving through the existing no-billing RPC.

## 3. Public listings board (`/public-listings`)
- Header row (one row): green publish button on the right, centered page title, official Realtyz logo on the left.
- Search row: no icon inside the field; the search icon button sits at the inner end of the field; deal filters become **למכירה** / **להשכרה** aligned next to the search field; the single list/grid toggle moves to the opposite side of the same row.
- Rebuild list and grid renderers to match the layouts used on the other listing pages (same card structure for grid, same compact row structure for list).
- Cards: drop the title heading; instead show a property icon plus the address — street name, neighborhood and city in bold, house number omitted (reuse the existing number-stripping helper).

## 4. "פרסום חינם" button and Yad2-style wizard
- Trigger: no icon, bold label "פרסום חינם", helper text under the trigger removed.
- Replace the single-form dialog in `PublicListingPublisher.tsx` with a 6-step wizard (no step 7, no plan selection):
  1. סוג המפרסם — מתווך / פרטי (buttons)
  2. סוג עסקה — השכרה / מכירה (cards)
  3. סוג נכס (buttons, not free text)
  4. כתובת ומיקום — city, street, house number, apartment, neighborhood, area, district with auto-suggest
  5. פרטי הנכס — rooms, floor, floors in building, elevator, parking, balcony, condition, air directions, open view
  6. תשלומים ומידות — ארנונה, ועד בית, מ"ר בנוי/גינה/סה"כ, מחיר, תאריך כניסה
  7. מדיה — photos and videos with drag-and-drop and counters
  8. פרטי התקשרות — name, WhatsApp number, terms checkboxes
  (steps 3-8 are the "form steps" of the flow; the two selector screens come first)
- Each step has back / next; final action submits.
- Address auto-suggest is served by a new authenticated backend function calling Google Places through the connector gateway (no Places calls from the browser), returning city, street, house number, neighborhood, area and district for the chosen suggestion.

## 5. Draft persistence and auth
- Extend the IndexedDB draft store to hold every new field plus media, saved as the user moves between steps.
- On final submit without a session: save the draft, send the user to `/auth` (any method), and after sign-in auto-publish the saved draft, then clear it.
- On entering the public board / listing page, auto-trigger the Google Connect toast so one-click sign-in is available.

## Technical notes
- Touched files: `src/components/AppLayout.tsx`, `src/pages/AffiliatePortal.tsx`, new `src/pages/AffiliatePricing.tsx`, `src/App.tsx`, `src/components/PageHero.tsx`, `src/components/PageToolbar.tsx`, `src/pages/PublicListingsBoard.tsx`, `src/components/public/PublicListingPublisher.tsx` (split into step components under `src/components/public/listing-wizard/`), `src/lib/publicListingDraft.ts`, new edge function `places-autocomplete`.
- Listing insert keeps `affiliate_enabled: true`, `status: 'live'`, owner scoping, and the one-active-property rule for private owners.
- WhatsApp contact field stays normalized to the official number rules already in place.
- Verification: typecheck plus a browser pass over `/public-listings` (mobile 435px and desktop), the wizard end to end, and `/affiliate-pricing`.
