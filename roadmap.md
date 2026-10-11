# Roadmap
## Credits ecosystem, email and sidebar
- [x] Credits-first sidebar/header/wallet/transparency/invite/partner/admin balances and rewards; financial/property prices remain in ILS.
- [x] Phone-only signup session path replaces generated new emails while preserving legacy account IDs; placeholder display suppressed. Mailbox reads no longer generate/activate aliases; explicit owner activation required, existing mailboxes retained.
- [x] Full-width top controls, hidden zero counters and accessible explanation, immediate wallet/contacts/profile drawer close, unique destination colors and 20% enlarged menu. Replaced numeric workspace initial with an office icon (the apparent profile zero was an initial, not a metric).
- [x] Eighteen focused tests passed; signed-in real sidebar/wallet/profile/contacts/invite flows and explanation checked without runtime errors. Menu fonts 16.8px/icons 19.2px, all eight visible destination colors distinct, automatic build OK. No real phone-only signup/OTP delivery or new mailbox activation performed; phone identity verified with isolated tests only.
## Invite friends dual-win bonus
- [x] Replace shared invite surfaces and subscription referral payouts with ₪200/₪100, personal copy/WhatsApp/email sharing; /invite aliases /referral and private accounts have access.
- [x] Account-scoped approved-deal evidence, automatic closed+approved submission hook, protected manual signed/completed-deal approval, atomic two-wallet credits, immutable awards, unique first-user payout, suspension/fraud/self guards and audit. Fixed pre-existing closing audit column mismatch blocking approvals.
- [x] Signed-in canonical copy and both share buttons verified without runtime errors; 13 tests and automatic builds passed. Live DB rollback exercised zero inquiry reward, approved deal 200/100 ledger/balance changes, repeat dedup and audit; ordinary-user approval rejected and foreign reads hidden. No real transaction approved or permanent funds credited; actual buyer/document approval and full role matrix were not exercised.
## Role toggle, partner feed, selection, wallet and Rita
- [x] Solid blue active disabled role toggle and sidebar Settings label.
- [x] Restore authenticated EXECUTE grant for shared-property feed; consent, license and distribution checks remain unchanged. Empty-safe global selection menus and search reset/error handling added.
- [x] Move automatic card setup and admin provider settings into wallet top-up; actual charging remains unavailable and is labeled accordingly.
- [x] Replace Rita categories with five role-aware prompts and verified-role concise workflow context; agent deployed.
- [x] Nineteen focused tests passed; signed-in partner feed returned nine shared properties, selection menu, wallet card form and five Rita chips verified. No card saved or charge attempted; actual AI reply and full live role matrix remain unverified.
## Sidebar partner onboarding and commissions
- [x] Sidebar-only switcher beside Help; introductory slides and protected digital consent before partner entry.
- [x] Account-scoped shared feed and commission icons under public/partner prices; verified closing restrictions.
- [x] Signed-in sidebar alignment, introduction → consent and cancel verified; 17 focused tests passed.
- [ ] Live consent acceptance/readback and populated multi-role feed verification (no consent submitted on user's behalf).
## Universal partner mode
- [x] Extend switcher to developer/broker/private accounts in sidebar, header and profile; retain core roles and return destination, check activation errors and update role cache.
- [x] Identity and account-scoped preference tests passed; signed-in developer verified header/sidebar/profile switches, partner navigation and refresh persistence without runtime errors. First-time activation and other live account types remain unverified.
## Global sidebar walkthrough
- [x] Connect sidebar Help in every workspace to concept/Rita introduction and role-scoped cross-page highlights with next/back/close/replay.
- [x] Six tests and automatic build passed; signed-in developer completed all 26 steps across real screens, with sidebar/button highlights, previous/intro return, Escape, completion and replay; no runtime errors. Other account types were checked by navigation-isolation tests, not live sessions.
## Developer projects cleanup and creation wizard
- [x] Clean title/blue header, top-left plus and empty-page metrics; move import into focused creation flow.
- [x] Eight-step manual editor with developer identity, location, status, units, images, specifications and explicit review/save; editing can jump directly to any step.
- [x] Signed-in eight-step creation, persisted project/company readback, edit and test-data cleanup verified without runtime errors; six focused tests and automatic build passed. Public project publication is not connected by the existing product, and real image upload/source import were not exercised.
## Developer direct entry and complete Yad2 import
- [x] Authenticated developer entry bypasses role/item screens; loading is fail-closed and stale pending roles cannot change developer entry.
- [x] Main-page URL validation, linked project reads, nested unit/source details and images, partial-read warnings, explicit save and non-null-preserving resync added; importer deployed.
- [x] Signed-in developer publication click reached /developer-dashboard?import=1 with no role/item fields; invalid item URLs rejected by UI and live endpoint; five focused tests and automatic build passed.
- [ ] Verify live full-source project import and confirmed saved readback: no real developer main-page URL supplied, and no existing sourced projects are available to exercise it; source blocking/pagination may prevent full extraction and is not claimed complete.
## Tutorial sanitation and role isolation
- [x] Replace internal commission/platform explanations with action-focused sharing, tracking, wallet and profile tutorials.
- [x] Add fail-closed role navigation, developer route isolation, server-redacted partner reads, restrictive referral/submission/snapshot/split policies, protected license verification and authorized closing-document endpoints.
- [x] Seven regression tests and signed-in three-slide guide/dismissal passed; partner RPCs succeeded and closing access was false, with no runtime errors and automatic build OK. Current partner submissions were empty, so nonempty redaction and the full multi-account role matrix were not end-to-end verified.
## One-click property referral sharing
- [x] Add authenticated personal referral copy controls to public grid/list/details, affiliate grid, inventory actions, My Ads and favorites; shared menus mint the signed-in user's link. Inquiry attribution validates the exact listing/workspace and logs referrals server-side without returning financial billing details.
- [x] Move image controls and labels into minimal above-image rows, retaining gallery swiping and navigation.
- [x] Verify signed-in stable copying in grid/list/full views, persisted referral, server-only attribution permissions, five regression tests and successful preview builds; no runtime errors.
- [ ] Verify an actual submitted referral inquiry and billing readback (not exercised to avoid charging real advertiser wallets or triggering calls; requires an approved test submission).
## Signed-out board and source publisher refinements
- [x] Relocate borderless sign-in after Add ad, enlarge main Realtyz logo by 30%, bottom-align card actions and use a confirmed-private-publisher silhouette.
- [x] Improve source-backed automatic Yad2 advertiser/logo classification without random reassignment of real advertisers; preserve source buckets, scoped advertiser names/logos and exclude related-ad classification. Import and public-view functions deployed.
- [x] Five advertiser tests passed; signed-out Add ad/auth navigation, nine equal card-bottom offsets and 435px iframe layout verified with no page errors or overflow; automatic build OK.
- [ ] Verify fresh live Yad2 extraction (blocked by existing source-provider rejection/CAPTCHA; scheduled/daily safeguards retained). Real advertiser records were not randomly changed to meet a two-private-ad quota.
## Original Yad2 advertiser branding
- [x] Save original advertiser metadata across item imports, source cache and market pool; inspect first gallery image before cleanup and retain matching branding separately. Four tests passed and real office-logo vision classification verified.
- [x] Require source-ad license evidence for imported listings; real שדרות ח״ן public card verified with loaded office logo, no unsupported license label and no runtime errors. Updated functions deployed.
- [ ] Verify a new live Yad2 scrape and logo persistence end-to-end (blocked by the existing source-provider rejection/CAPTCHA; no new scraping attempt made).
## List expansion cleanup
- [x] Remove inline close button, move expansion arrow before address and show expanded title/price once. Signed-in narrow-table expansion/collapse and horizontal scroll verified without runtime errors; container layout stays readable, build OK.
## Public ad presentation refinement
- [x] Unify deal-prefixed title/price, public publisher attribution below title with office/license inline, and share beside favorites across grid/list/details; reuse existing public endpoint without private reads.
- [x] Add safe close/back navigation; signed-in live grid/share/details/favorite-refresh/restore/list-close verified without page errors, three tests passed and automatic build OK. Narrow-container overflow checked; actual mobile device not tested. Missing public publisher details remain uninvented.
## My Ads favorites
- [x] Add personal favorites tab with public-safe previews and persistent removal; verified signed-in save/list/remove/refresh without runtime errors, automatic build passed.
## Public card gallery and priced inquiries
- [x] Align image pills, 50% image-control backgrounds, horizontal swipe, larger price/title and renamed Rita action.
- [x] Show inline name/phone only for form-only ads; classify conversation contacts after real name capture and satisfactory screening without premature billing.
- [x] Verified live gallery arrows/swipe, inline form, 20px price and 17px title without runtime errors; three focused tests and automatic builds passed. Live WhatsApp/phone qualification and wallet billing were not exercised; 112 pre-existing database security findings remain outside this change.
## Public board table customization
- [x] Add ascending/descending header sorting and mouse/keyboard/touch-capable draggable column order.
- [x] Add minimal column visibility menu and user/workspace-local remembered preferences after refresh/exit.
- [x] Verified numeric sorting in both directions, mouse/keyboard reordering, hiding and refresh persistence with real listings; expanded-row spans match visible columns, no runtime errors. Real touch-device testing remains unverified.
## Address finder and publication steps
- [x] Refine Hebrew address selection and conditional city/street/house-number row; remove apartment input and relocate floor selectors.
- [x] Number publication sections 1–7 independently of setup, preserving saved draft step identities.
- [x] Verified live Hebrew searches in Tel Aviv and Haifa, keyboard/click selection and aligned 390px layout without publishing or runtime errors. Uses existing Google Places Israel/Hebrew integration; complete nationwide database coverage and real iOS devices remain unverified.
## Failed ads and quick resume
- [x] Add workspace-scoped failed/incomplete ads and local draft recovery with missing fields and saved failure notes; signed-in list showed ten incomplete records.
- [x] Resume saved editing step and values; signed-in contact edit survived refresh and reopened at the contact section. Existing-record publication updates by workspace/id; actual publication was not performed.
- [x] Verify signed-in list/resume without page errors and mapping/required-field checks; build OK. Tabs fit a constrained width; full embedded mobile preview and successful live publication remain untested.
## Broker publication experience
- [x] Identify brokers using active member role and current profile; signed-in skip, name/phone defaults and marketing checked verified; legal terms remain unchecked.
- [x] Show first property image and summary in explicit confirmation; image, price, rooms, floor and area verified with local test input, then returned to editing.
- [x] Add five-second fullscreen top-down celebration with gesture-prepared audio; isolated browser check confirmed canvas cleanup/audio closure and no errors. Real publication was not performed, and audible output depends on browser permissions.
## Inventory visibility and search layout
- [x] Refresh active-workspace imported inventory, including saved partial Yad2 properties outside service cities; saved imported address verified in the signed-in table.
- [x] Add workspace-specific search history with an initially empty field and conditional opposite-side search action; reopening history and redoing a search verified.
- [x] Align compact orange/blue sources with deal toggles and a 10px tools gap; immediate source filtering and exact gap verified.
- [x] Verify signed-in controls and horizontal table scrolling in both directions using visible arrows; build OK, no page errors. Browser check used a constrained container, not the embedded Lovable mobile preview; fresh scraping was not tested.
## Inventory suggestions and quick public promotion
- [x] Add live active-workspace address/title suggestions and move search action opposite the deal toggles; eight real suggestions and keyboard opening verified.
- [x] Add explicit single/bulk public publication of existing workspace records, with database workspace authorization and completeness guards; prices/commissions preserved.
- [x] Signed-in multi-selection, confirmation gating, cancellation and 435px layout verified without errors/overflow; build OK. Live publication/readback not exercised to avoid publishing actual inventory unintentionally.
## Photo order and local Yad2 reuse
- [x] Add accessible RTL photo-order arrows in both property editors; signed-in thumbnail swap verified and reversed without changing live records. Existing explicit-save path persists the ordered array; a live save was not performed.
- [x] Check exact active-workspace Yad2 records before import requests; signed-in controlled recent-timestamp test opened the saved record without a fresh-import request. Server cache reads preserve edits/order/timestamps; daily scrape safeguard retained and function deployed.
## Search controls and conditional Homely
- [x] Redesign dual deal toggles, borderless sorting and expandable colored source dots; signed-in desktop/narrow-screen checks passed.
- [x] Gate operational Homely sources, badges, import actions, tabs, property links and status rows by verified active-workspace connection; preserve setup and administrative/legal surfaces. Disconnected workspace verified; connected workspace not tested.
- [x] Counter uses relevant completed-search snapshot (13 matching results and 0 for no match verified), hides on refresh/exit, no page errors; build OK.
## Property search and duplicate-safe imports
- [x] Update existing workspace Yad2 items safely, retain previous version details, and retry concurrent uniqueness conflicts without duplicates.
- [x] Add default-selected source dots, remove microphone, align checklist/sort and source pill, and match public-board deal dots/filter icon.
- [x] Signed-in browser verified all sources selected, last-selected safeguard, checklist and rent dots; repeat import opened the same property ID and database confirmed one copy per workspace with retained version metadata. Fresh extraction remains blocked as noted below.
## Automatic Yad2 imports and daily caching
- [x] Automatically import valid pasted links with visible progress and no duplicate requests; browser verified eight editable cards with no page errors.
- [x] Persist available source details and workspace-specific unpublished copies; atomic server-only item cache enforces one fresh attempt per 24 hours, including background-read credit protection.
- [x] Verified cached import opens Properties and editable review; corrected legacy global source uniqueness to workspace-scoped uniqueness.
- [ ] Verify complete fresh extraction with working Bright Data credentials (current token rejected with 401; browser fallback encounters Yad2 CAPTCHA). Existing stale data is explicitly labeled; missing fields remain editable.
## Udi access and Yad2 inline review
- [x] Add Udi as managing_broker in Barak's workspace only, without granting global privileges; authorized workspace-list read confirmed membership.
- [x] Replace pasted Yad2 links atomically and replace the circle modal with eight inline editable accordion cards.
- [x] Verify repeated paste replacement, inline edits across card switches and live completion indicators in the signed-in UI; build OK, no page errors.
- [ ] Verify every owner-equivalent permission as Udi inside Barak's workspace (blocked: preview keeps the injected Rita identity despite locally minted Udi session; account-level billing, private credentials and global admin powers are deliberately excluded).
## Connection card refinements
- [x] Reorder group buttons, update sync icon and active count, rename business Page, and immediately reflect saved direct Instagram association with Page-dependent actions. Signed-in header count matched Activity, connected IG badge rendered green, section switching passed, five regressions passed and build OK; a new IG save was not performed on the live account.
## Independent Facebook sections
- [x] Separate Facebook authentication and extension group management, preserving tabs, limits and live joining independently of Page state; signed-in section switching verified, five regression tests passed and build OK. Existing over-limit legacy groups remain unchanged; no Facebook joins were initiated by the checks.
## Live group joining indicators
- [x] Show per-group extension-driven joining animation and immediately migrate confirmed joins to Activity without stale polling reversals; five focused tests passed, signed-in groups page checked and build OK. Updated extension requires reload; actual Facebook joins remain unverified.
## My ads and expansion updates
- [x] Keep My ads available to signed-in private owners with ads and remove the private-owner posting cap.
- [x] Add authorized Yad2 URL import with explicit publication, preserved draft details and mirrored trusted source images; live Yad2 extraction/publication remains unverified.
- [x] Add property images and expandable persisted statistics/history including per-affiliate views, contacts and paid bids; history is paginated and queries refresh every 30 seconds. Historical granular view/click data cannot be reconstructed.
- [x] Replace My ads arrow with a chevron.
- [x] Add shared smooth single-open expansion and update custom property, task, dashboard, campaign and chat cards; signed-in My ads desktop/mobile checks and three expansion tests passed. Not every app route was visually tested.
- [x] Immediately block explicitly rejected Facebook groups with visible reasons, persistent queue/send exclusion and manual unblock; database rollback checks and signed-in reason/unblock flow passed without Facebook publication. Updated extension 1.9.3 requires user installation; real Facebook rejection remains unverified.
- [x] Restore full per-group campaign cards, reliable live progress and updated publication status icons; 18 tests passed, signed-in expansion into ten children and narrow-screen layout verified without posting. Actual Facebook execution remains untested.
- [x] Isolate Facebook page sync by workspace, acknowledge extension delivery before tab cleanup, and validate initiating workspace binding; five regression tests and background ACK lifecycle checks passed, live authenticated config confirmed Rita Graph / Udi extension / foreign workspace 403, build OK. Actual Facebook scraping and Graph import require the connected browser and remain unverified.

- [x] Unify campaign metadata in one ordered nonwrapping row, strengthen nested subpost boundaries, restore per-group statuses and provide full-name expansion; 13 tests passed and signed-in 1280/435/360px views verified ten nested subposts and full-name expansion with no overflow or runtime errors, without publication.

- [x] Expand campaign series below the main card, move repost to the row edge, derive accurate statuses and truncate single group names; eight tests passed, build OK, signed-in desktop/mobile expansion and collapse verified with ten series cards, no overflow or runtime errors, without publication.

- [x] Show megaphone repost action, icon-first single group or collapsed multi-group count opposite logo/date, and remove the main-card expansion arrow; verified signed-in desktop/mobile header, portaled counter details, no horizontal overflow/errors and five passing tests.

- [x] Harden individual and select-all group selection with immutable guarded updates and one activation per row; verified signed-in desktop/mobile repeated toggles and cancellation, no runtime exceptions, and five passing regression tests without publication.

- [x] Replace group counters with unframed names and adjacent status icons; remove perpetual and redundant card loaders. Verified signed-in cards, series overlay, mobile layout and seven regression tests without Facebook publication.

- [x] Clean expanded groups and remove the repost title field.
- [x] Preserve clean text and configured first-comment link selections without misrepresenting Rita.
- [x] Fix and verify multi-selection layout on campaigns.

- [x] Open continuation/repost in the full editor with editable settings and safe explicit resubmission.
- [x] Align cancellation right beside publication confirmation and verify signed-in edits, cancellation, future-scheduled save/readback and cleanup without Facebook publication.

- [x] Preserve successful post status with subtle first-comment warnings.
- [x] Keep card order stable and collapse related campaign posts into master cards.
- [x] Use text-only group count pills, standardize בתור, and prefer direct post URLs with group-page fallback.

- [x] Replace Rita's property promotion picker with persistent group topics feeding AI generation; retain the existing property picker for other workspaces.

- [x] Clean existing duplicate post images and prevent duplication during fetching, saving, and rendering.

- [x] Permanently delete posts and associated queued jobs with verified results.
- [x] Offer current-post or entire-series deletion for master posts.

- [x] Keep campaign/post card titles and content stable between explicit edits.

- [x] Enable horizontal scrolling for the affiliate table on mobile and preview.
- [x] Add permanent single and bulk property deletion with workspace-safe authorization.
- [x] Show property selection controls only while multi-select mode is active.
- [x] Remove the icon beside הערות משרד.
- [x] Open public property cards on their dedicated property page.
- [x] Add the public property-card share menu beside the active contact action.
- [x] Keep RTL search icons clear of placeholder text.
- [x] Place the master property selector immediately right of the search field.

## Facebook fixes (2026-09-25)
- [x] Rita auto-replies on Messenger/Instagram DMs
- [x] Scheduled group posts wait in the extension queue until the chosen time
- [x] Page connect subscribes the Page to Messenger/comment webhooks + asks pages_manage_metadata/pages_messaging
- [ ] Reconnect both Facebook Pages (blocked: owner must reconnect; current tokens can't enable delivery)

## Group pills and posting continuation
- [x] Lock group-pill/dropdown geometry and open single-group links directly.
- [x] Add confirmed workspace-safe continuation/resubmission preserving original job data and schedule.
- [x] Verify layout and confirmation on the signed-in workspace; test retry/resubmit with mocked jobs, without live Facebook publication.

## Oct 6 batch (9 updates)
- [x] 1. Search bar: icon to opposite side, filter button (affiliate filter popup incl. bid range), "Search" button when text present
- [x] 2. Public board as default homepage for all; signed-in header (burger, notifications, logo, full name, Rita photo)
- [x] 3. Public list view = /properties table minus affiliate/office cols, horizontal scroll, inline expand below row (one open at a time)
- [x] 4. Landing pages show every detail/feature/extra from /properties
- [x] 5. Multiselect icon button (list-check) right before sort button
- [x] 6. Rita chat: skip name/phone form, open WhatsApp with message referencing the ad, Rita asks name
- [x] 7. Show action buttons per priced lead type on public ads
- [x] 8. Signed-out "share ad": affiliate onboarding flow, then share the original property
- [x] 9. Daily lead cap, stop promotion + FB group posts at cap, partner leftover discount (% or fixed), leftover purchase screen, WhatsApp partner attribution via referral code

## Lead and inquiry terminology
- [x] Rename counter and explanation to the requested לידים copy; align sales navigation, tooltips, onboarding and helper text with לידים / פניות, preserving stored values and contact details.
- [x] Eight focused tests passed; authenticated counter → exact explanation → leads page verified, drawer closed, no runtime errors and automatic build OK. Legal wording and saved status values retained.
