# Developer projects board
- [ ] Match the global board search, advanced filters, deal controls and grid/list presentation.
- [ ] Preserve and display project/building/unit hierarchy through Yad2 extraction and sync.
- [ ] Test hierarchy retention and verify project browsing on mobile and desktop.

# Lead limits and closing fee
- [x] Fix CRM import against the actual expression/partial unique index with server-authorized workspace scope; focused tests pass. A repeat-import UI check remains unverified without a matching workspace-owned lead.
- [x] Preserve existing-ad pricing, per-tier caps, screening questions and custom fields through hydration and save; recovery/editor tests pass. Live existing-ad save remains unverified because the active workspace has no ads.
- [x] Replace general cap with per-priced-type limits, persisted and enforced.
- [x] Add shared LTR closing slider with editable value, correct ranges and honest network feedback.
- [x] Verify slider and conditional limits on phone/desktop; verify draft reload and rent amounts. Existing ad save not exercised because screenshot ad is unavailable.

# Welcome and commission interactions
- [x] Repeat homepage intro until explicit opt-out and reopen from logo.
- [x] Make lead commission labels open pricing, limits and requirements through shared controls.
- [x] Verify intro replay and real signed-in public card/full-property pricing; inventory test loaded no priced controls.

# Master branding
- [x] Publish safe master office branding from Rita's workspace and synchronize office edits.
- [x] Inherit missing office logos across workspaces without affecting profile photos.
- [x] Connect public/home/Terms branding and validate live updates and isolation.

# Board header
- [x] Swap the public logo and publication action, add the tagline and icon-only sign-in.
- [x] Rename the public and authenticated board title.
- [x] Verify mobile/web layout and sign-in navigation.

# Single-row board header
- [x] Drop the slogan line, its colour token, and restore the office name to TORAF.
- [x] Order the row right to left: logo, board title, account icon, publish action.
- [x] Tighten the gap above the search row and confirm phone/web rendering.
