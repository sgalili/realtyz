# Auth screen refinements
- [x] Fixed header/tabs positions, contiguous uniform fields and viewport-fixed footer; verified identical tab/header/card geometry at 411×802, 360×640 and 1280×1800, shared 40px field heights and footer 10px from bottom during form scrolling. All 11 signup tests and preview build pass; no OTP sent or account data changed.
- [x] Merge company dropdown option, add full-name input, stabilize tabs and apply requested typography, logo spacing, ticker and footer changes; no account/profile persistence changes.
- [x] Verify exact unchanged tab/scroll geometry and signup controls on phone/desktop; all 11 signup tests pass. No OTP sent or account created.

# Closing split explanations
- [x] Added shared broker signup/onboarding disclosure, dynamic closing-slider gross/net breakdown and asterisk notes in authorized closing pricing and public-board cells; no payout or permission changes.
- [x] 11 focused tests pass, including the 1.0% → 0.8%/0.2% example and unauthorized hiding. Broker signup explanation and empty license field verified in mobile/desktop browser; preview build passes. Authorized broker public-board display was tested at component level, not in a live broker session.

# Universal broker license enforcement
- [x] Added private official-registry evidence and database guards for grants/profile/affiliate updates; checked every existing broker license against the current government source, archived and removed 8 invalid role rows; zero unverified broker roles remain.
- [x] Removed placeholders and restricted license fields to ASCII digits; 17 focused tests pass, browser signup filters pasted letters/symbols and shows the exact Hebrew error; authenticated invalid profile write and unknown-license verification are blocked. Preview build passes. Successful license-save/restoration was not exercised because the available session is a developer and no broker-account change was authorized for testing.

# Post generation repair
- [x] Restore complete property-specific Hebrew posts and dedicated first-comment generation without changing the model or existing output caps; deploy and verify both return 200 for the selected משה סנה project.
- [x] Reject truncated/internal-reasoning output; 13 focused tests pass, authenticated regeneration shows full Hebrew copy plus the two-line comment and existing contact link after reload; preview build passes. No post was published.

# Partner company inventory and wallet controls
- [x] Show saved active-workspace projects and imported units alongside existing properties, without automatic publication; real company shows seven projects with names/photos, search and details in mobile/desktop views. Missing source apartments remain absent; 20 focused tests pass.
- [x] Move wallet back chevron left and shekel price-list icon right; authenticated opening of six price entries and return to partner marketing verified without runtime errors; preview build passes.

# Developer project counters and promotion
- [x] Add workspace project counters in the sidebar and company header; authenticated company header shows 7 and project queries page through the full workspace inventory.
- [x] Separate commission settings, add company-wide defaults, daily caps and shared screening/form-field dialogs; authenticated save/reload verifies form 10, phone cap 3, fixed closing 5000 and questions across all 7 projects; original values restored.
- [x] Connect explicit project promotion and public published-unit grouping/details; use public-safe property specifications, retain source evidence and make saved project/unit targets available to posting. Real project deep link selects KATA IDOL and its photos.
- [x] Run 21 focused tests and authenticated persistence/publication-guard checks; no runtime errors and latest preview build passes.
- [ ] Successful public project/unit publication and public hierarchy round-trip: blocked by missing imported apartment records and prices in all seven saved projects, and no approval for live publication; no source details or units fabricated.

# Broker signup registry and wallet navigation
- [x] Require empty numeric broker license input and official registry validation before broker registration; exact active-license lookup uses the Ministry of Justice data.gov.il dataset.
- [x] Enforce private server-written registry evidence before new broker grants; signup, post-auth choice and publisher share validation, without trusting editable profile licenses.
- [x] Replace affiliate gift with wallet navigation and wallet shortcut with previous-page back arrow; authenticated return to affiliate-network verified.
- [x] 20 focused tests pass; live signup checks reject an unknown number and accept an official entry; authenticated invalid verification rejected and latest preview build passes. A new account and positive broker-role grant were not created, so complete OTP signup remains unverified.

# Intro background and opt-out
- [x] Replace boxed icons with slide-wide drifting line icons and increase regular-weight subtitles by 4px (24px mobile, 28px desktop).
- [x] Respect opt-out for homepage/logo/header and add explicit replay to app instructions without clearing dismissal.
- [x] Verify all five mobile slides, desktop appearance, continuous motion, reload/logo dismissal and authenticated instructions replay/header return; five preference tests pass and preview builds successfully.

# Developer New Post repair
- [x] Load workspace inventory and project/building/unit targets without requiring public publication; Kobi's seven saved projects appear.
- [x] Authorize generation context server-side and avoid passing project references into listing UUID fields.
- [x] Six focused tests pass; real project generation returns 200 and text appears with photos. Scheduling/publishing was not submitted to avoid live distribution; its persistence remains unverified.

# Intro, property headings and developer defaults
- [x] Redesign five intro slides with gradients, highlighted Hebrew copy, swipe/side navigation and explicit dismissal; mobile/desktop checks confirm edge arrows, scroll lock and opt-out after reload.
- [x] Wrap shared public, inventory, partner, My Ads and developer headings; a real public heading with long test text keeps its price inside with no overlap.
- [x] Remove developer deal question and use sale by default; real Kobi project editor checked without saving. All 16 focused welcome/developer form/commission tests pass.

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

# Facebook groups extension sync flow
- [x] Live-verify the extension (RZ_EXT_STATUS ping) before search/join/sync/pair; clear stale install flags.
- [x] Replace the dead-end "install the extension" toast with a friendly panel: download button, install steps, retry, and manual group entry by link.
- [x] Show a live connection status line in the sync dialog (detected / not detected / checking).
- [x] Unify detection in src/lib/extensionDetect.ts; update stale joining tests; 11 focused tests pass.

# Cloud-first Facebook pipeline (no extension required)
- [x] fb_group_fetch_jobs table (workspace-scoped RLS) + fetch_groups/fetch_status/fetch_result actions in fb-session-vault (deployed).
- [x] fb-session-vault resolves+authorizes the active workspace server-side for all actions; members manage the shared cloud session.
- [x] cloud-runner/index.js handles job_type=group_fetch (scrapes groups with the saved session, reports back).
- [x] GroupDiscoveryDialog is cloud-first with tabs: cloud search/save + optional extension tab + always-available manual add; no blocking "must install" prompt.
- [x] CloudPostingSessionCard visible to all workspace members at /api-settings#cloud-automation; sync dialog shows cloud status.
- [x] 15 focused tests pass; build OK. Railway runner must be redeployed for group_fetch support.

# Cloud-only group quotas and joining
- [x] Removed extension controls from group connection/discovery; mobile authenticated UI checked, cloud state and group events are server-derived, no cached membership overrides.
- [x] Added locked workspace 100-active/200-reserve pools, canonical duplicate detection, event-driven join jobs and atomic preflight/rotation in both cloud dispatchers. Current pools have no invalid active members.
- [x] Added supplied-answer/rule-consent handling, serialized joins, approval rechecks and interrupted-job recovery on existing scheduler ticks; 13 focused tests and preview checks pass.
- [ ] Live joining/search/post rotation acceptance waits for Railway worker redeployment with CLOUD_CALLBACK_ORIGIN and an active Facebook cloud session. No live Facebook join or post sent; arbitrary question types require the remote cloud browser.

# Auth phone field style and field typography
- [x] Reverted the התחברות phone field to its earlier label-plus-bordered-pill design with the channel icon, left the הרשמה phone field unchanged, and made the user-type dropdown placeholder match the full-name and phone placeholders; all three render 18px on phone and desktop (dropdown was 14px, inputs 16px).
- [x] Verified identical card/logo geometry across tab switches at 411×802 and 1280×900, send-code button appears after a valid number, 17 focused tests pass and preview build is OK.

# Auth header swap, tagline wording and login placeholder
- [x] Moved the rotating sentences above the TORAFF logo (the logo now sits directly above the form), replaced "הכנסות מסביב לשעון" with "הכנסה פאסיבית", and moved "מה מספר הטלפון שלך?" inside the login field as a placeholder at 18px to match the full-name field; no label remains above that field.
- [x] Verified at 411x802: ticker above logo, identical card geometry on both tabs (top 259, height 440), no page scroll, footer 11px from the bottom, and all field texts render 18px. 17 focused tests pass and the preview build is OK.

# Auth text nudge and borderless central section
- [x] Shifted the rotating sentences 20px upward (mobile and desktop top 67 -> 47) while the TORAFF logo and form kept their exact positions (mobile logo top 151, card top 259, card height 440, footer 11px from the bottom, no page scroll).
- [x] Removed the central section's rounded box, background and border (computed background transparent, border 0px, no shadow); tabs, fields and buttons stay fully legible on the page background in phone and desktop views.

# Signup menu wording
- [x] Removed "פרטי" from the user-type options so they read קונה/מוכר and משכיר/שוכר; the same labels feed the sign-up dropdown and the role-choice step. Options verified in the browser and 16 related tests pass.
