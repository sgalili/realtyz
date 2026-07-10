Plan:

1. Homely import fixes
- Update the Homely bulk fetch filter so rentals (להשכרה) are not excluded by the current sale-biased gate.
- Strengthen transaction detection for sale/rent using more Homely/Webtiv aliases and Hebrew text fields.
- Add robust extraction for מרפסת from Homely raw data, including boolean/numeric/Hebrew values, and store it consistently in `source_metadata` and the listing `features` array.
- Improve media extraction for Homely/Webtiv payloads by scanning nested photo/image/gallery fields more broadly and preserving original URLs when mirroring fails.
- Improve Yad2 enrichment so it runs when Homely source/origin/url indicates Yad2, not only when one exact field equals `yad2`; store `source_origin: 'yad2'` and the Yad2 URL when found.

2. Property list UI
- Add a מרפסת column to the table view.
- Add מרפסת to property cards in the main list.
- In the source column, show `yad2` when the Homely-origin listing source is Yad2, and make it open the Yad2 page in a new tab when a Yad2 URL exists.
- Make listing type extraction prefer stored Homely metadata instead of defaulting unknown rows to sale.

3. Property details UI
- Ensure the title keeps the full address/city/neighborhood.
- Show מרפסת in the features/specs section from the imported Homely value.
- Preserve the Yad2-only external link behavior, but make it use the improved stored Yad2 URL.

4. Header and sidebar behavior
- Remove the profile popover menu from the header.
- Make the header profile image a direct link to `/profile`.
- Make the sidebar profile section link to `/profile` and close the mobile sidebar after click.
- Fix the small square workspace logo overlay so it is fully visible, not clipped.
- Replace the centered Realtyz logo in the header with the active workspace logo and workspace name.
- Change the app header background to white and make header icon buttons red.

5. Profile page
- Add a sign-out button at the bottom of the profile tab.
- Simplify the office logo section: show only logo upload boxes.
- Add titles above logo boxes: `לוגו ריבוע` and `לוגו מלבן`.
- Clicking each logo box opens upload/replacement.
- Add a trash icon to delete each logo.
- Keep the square logo for office/avatar-style use and add a landscape logo for the main header logo.
- Remove the `אזור התמחות` section.
- Update `אזורי שירות` to support multiple locations with a plus button.

6. Backend schema if needed
- If `white_label_settings` does not already have a landscape logo field, add a safe migration for `landscape_logo_url` with existing RLS/grants preserved.

7. Validation
- Verify Homely sync returns rent rows, balcony values, photo URLs, and Yad2 URLs in the returned/imported data.
- Verify property list cards/table and details page show מרפסת and correct clickable Yad2 source.
- Verify header/sidebar/profile flows visually: white header, red icons, workspace brand, direct profile navigation, sign-out button, simplified logo upload UI.