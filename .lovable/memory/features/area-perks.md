---
name: Area Perks Enrichment
description: listings.area_perks jsonb cache populated by neighborhood-perks edge fn (Firecrawl yad2+Google -> Lovable AI). Injected into suggest-comment-reply (perksBlock, max 1 perk per reply) and generate-content (promotedBlock "יתרונות סביבה קרובה"). Fire-and-forget invoke when missing. 30-day TTL.
type: feature
---
- Column: `listings.area_perks jsonb` = `{ perks: string[], one_liner_he: string, sources: string[], fetched_at: iso }`.
- Edge fn `neighborhood-perks` body: `{ listing_id, force? }`. Uses FIRECRAWL_API_KEY + LOVABLE_API_KEY.
- Both `suggest-comment-reply` and `generate-content` read `area_perks.perks` and fire-and-forget the enrichment when empty.
- Strict prompt rule: at most 1 perk per reply (short, max ~7 words); never invent perks outside the cached list.
