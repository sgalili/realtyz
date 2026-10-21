# Intro, property headings and developer defaults
- [ ] Redesign five intro slides with vivid gradients, concise Hebrew copy, swipe/side navigation and explicit dismissal; lock scrolling.
- [ ] Wrap long property headings without displacing prices across shared views.
- [ ] Remove developer deal question and use sale by default; verify behavior and existing tests.

# Signup identity and partner sidebar
- [x] Require five explicit primary signup types; persist through a constrained authenticated operation without changing established core roles.
- [x] Show primary workspace identity and persistent partner switch; adapt company/office profile and authorized menus.
- [x] Verify five signup choices, Kobi's developer identity, company tab and partner switch in the authenticated mobile drawer. Focused role/signup/commission tests run; new-account OTP registration and every role's full signup remain unverified without creating new accounts.

# Developer commissions and sidebar
- [x] Align view options after deal controls across board, partners, inventory and developer projects. Mobile/desktop loaded board, partner and real developer project toolbars verified; inventory initial toolbar verified before developer redirection. Existing mandatory fee/bulk/unit/save tests: 21 pass. No live publication performed; successful project/unit publishing still requires source units and explicit approval. Public closing-price fallback outside the authorized marketplace remains unverified; do not expose raw closing fees.
- [x] Fix workspace dropdown scrolling and remove the lead button icon; actual wheel scrolling verified from 0 to 365px.
- [x] Add mandatory project/unit commission setup, scoped bulk assignment and individual overrides, preserving authored fees on sync.
- [x] Enforce publication on the server and reuse standard commission badges; public publication creates ordinary listings with existing visibility guards.
- [x] 21 focused tests pass; authenticated real-project save/reopen returned form fee 10 and phone cap 3; original values restored. Incomplete publication rejected by the server. No public ads were created; successful live project/unit publication remains unverified because saved projects have no source units and publication requires explicit approval.

# Role isolation and pricing audit
- [x] Audit core role/listing/lead/project policies; remove developer signup's unintended broker grant and broad listing policies; fail closed during workspace validation and remount tenant content. Kobi retains developer+affiliate only.
- [x] Verify positive-price-only caps, LTR slider bounds/colors and fixed/percent preservation; isolate pricing drafts by user/workspace/listing. Correct percentage-type propagation.
- [x] 33 focused tests pass; authenticated browser confirms Kobi workspace shows יזם/שותף without runtime errors. Full multi-account switching and live existing-ad save/reload remain unverified: current session has one workspace and no editable priced ad. This is a core-path audit, not exhaustive all-table certification.

# Developer projects board
- [x] Match the global board search, advanced filters, deal controls and grid/list presentation.
- [x] Preserve and display project/building/unit hierarchy through Yad2 extraction and sync; missing source unit data is explicitly reported, never invented.
- [x] Test hierarchy retention and verify authenticated browsing of seven real projects, search, expansion and list sorting on mobile/desktop. Live Yad2 hierarchy completeness remains unverified; saved projects have no source unit details.

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
