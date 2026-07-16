I found the actual failure: the importer is treating every text field in the Homely record as an image candidate because `collectMedia` is too broad. For listing `5517`, it converted owner name, phone, city, address, floor, dates, and description into fake URLs like `https://webtivapi.webtiv.co.il/050-8681107`, then all 24 candidates failed mirroring. The real fix is to stop inventing URLs from non-photo fields and rebuild media extraction around explicit image fields and verified endpoints.

Plan:

1. Replace broad recursive media scraping with strict field-aware extraction
   - Only accept values from explicit image/media keys, not arbitrary strings.
   - Remove the dangerous fallback that turns any Hebrew/text value into a `webtivapi` URL.
   - Add Hebrew/Webtiv aliases for likely real photo fields, but require URL/path/image-like structure.

2. Add a Webtiv image URL resolver
   - Support common Webtiv relative/ID-style image paths safely.
   - Try known image endpoint patterns for a property serial only when the stream does not expose direct URLs.
   - Verify each attempted URL returns real image bytes before saving anything.

3. Make source order deterministic and safe
   - First: rich Homely/Webtiv detail API photo fields.
   - Second: stream/API explicit photo fields.
   - Third: public source API/page enrichment only when available.
   - Never use generic page text or arbitrary object fields as images.

4. Harden verification and mirroring
   - Keep rejecting logos, icons, placeholders, social pixels, documents, and non-image content.
   - Keep the 300x300/20KB validation, but record exact rejection reasons in listing metadata.
   - Save only mirrored backend-storage URLs to `media_photos`.
   - Never overwrite existing valid photos with an empty result.

5. Improve diagnostics for future imports
   - Log the raw Homely keys and explicit media fields per property.
   - Log candidate counts by source, mirror success count, and rejection reasons.
   - Store `photos_candidates`, `photos_rejected`, and `media_photos_source` in metadata so each failed import is inspectable from the database.

6. Validate against the current broken listing
   - Re-run/import or invoke the function for listing `5517` after changes.
   - Confirm `media_photos` is no longer populated by fake text URLs and only contains verified property images or preserves previous images if none can be verified.