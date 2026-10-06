# Roadmap
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
