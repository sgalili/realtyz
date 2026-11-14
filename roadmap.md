# Roadmap

## Lead details and distribution backlog November 14
- [x] Direct authorized lead details from CRM/inbox; optional public profile closes back to mounted details. Real lead checked desktop/mobile; community behavior unchanged.
- [x] Existing Facebook group queue reserves sequential days/slots against group/page/account caps, posted counters/completed jobs and pending reservations; existing worker tick checks due backlog.
- [x] Once-per-day channel-specific in-app advice when backlog exceeds daily capacity; ten isolated database rule tests plus seven existing access/capacity tests. Workers deployed, service-only functions read back. No actual posting or live multi-asset distribution performed; other channel types retain their existing delivery rules.

## Profile view and zero commission labels November 14
- [x] Replace zero commission wording with 0₪ without changing reward visibility.
- [x] Use the shared opposite-view toggle, list default and one inline expanded property at a time.
- [x] 41 affected tests pass; real populated profile click/inline details/close/grid-list switch checked desktop/mobile without popup, overflow or page errors.

## Grow saved cards and lead auto-billing November 14
- [x] Explicit unchecked customer mandate; save only provider-vault references after independently verified live card payments, never raw card data or noncard methods; safe card display and self-only revocation in Wallet.
- [x] Server-priced background authorization jobs on fee/cap save: highest lead bid ×5 or explicit daily spend cap. Persist results, verify scoped operation/amount, release hold through Make, no claim of total credit-limit visibility. Only permitted idempotent token-authorization capabilities run; raw tokens stay in provider vault.
- [x] Ten focused tests pass; signed-in card checkout mandate checked mobile with intercepted provider offer, unchecked default and no overflow. Migrations/trigger presence read back, workers deployed and preview OK. No actual tokenization/hold/charge performed; live provider verification requires Grow/Make setup.
- [ ] Exact-cost, idempotent low-wallet settlement with no wallet movements and transparent payment history requires working Make token-charge/status/release routes and Grow delayed-payment permission; no speculative live settlement enabled.
- [ ] Existing wallet lead billing remains unchanged until direct-settlement, disputes/refunds, partner reward release and daily budget reservations are tested with actual provider support. No wallet guard bypass or deletion of partial remaining funds. Grow/Make credentials remain unavailable.

## Super Admin credit balance editing November 14
- [x] Per-user exact balance editor with server Super Admin checks, central conversion, atomic ledger delta and stale-balance conflict protection; missing wallets initialize only on confirmed save.
- [x] Affected wallet/account queries refresh after save; active customer wallet polls every 10 seconds. Two focused tests cover zero/fractional/invalid values and scoped exact-save payload; live function definitions/guards read back. Authenticated real Users table loaded balances, blocked negative value and saved unchanged 100-credit balance through real RPC with table readback; mobile editor fits. Preview OK, no funds changed. Cross-account denied-role path source-audited, not impersonated.

## Minimal checkout and payment SMS November 14
- [x] Minimal method selector and gateway-declared customer fields; sensitive payment fields remain on Grow checkout. Unsupported methods disabled rather than invented.
- [x] Verified live-payment SMS outbox, atomic claim and provider result tracking; sandbox sends no SMS. Ambiguous/interrupted delivery requires operator review, never blind retry.
- [x] Seven focused safeguards pass; signed-in wallet checked desktop/mobile with intercepted gateway capabilities/create: Bit omits name, bank fields validate, secure link returned, no overflow. Preview build OK; migration applied and function deployed.
- [ ] Real checkout/method availability and SMS delivery need the existing Make credentials/terms plus capability mapping. No charge or SMS sent; current Make connection remains unconfigured. Hosted Grow fields/branding are provider-controlled; legacy orders without customer mobile cannot receive a summary.

## Profile clicks and contact permissions November 14
- [x] Lead/community/sidebar avatar and name entry points open clean profiles first; server-authorized management and own-client phone, contact-free peer profiles, internal official WhatsApp routing, 20px header/action spacing.
- [x] Five focused tests pass; real signed-in self-profile → self-settings and lead profile → authorized edit verified desktop/mobile without writes. Server readback returns no unknown-lead rows; preview OK. Full SQL multi-account test retained but sandbox SQL role cannot execute auth-only RPCs; no permissions weakened to run it.

## Independent expanded table scrolling November 14
- [x] Restore native horizontal scrolling for table summaries; shared FixedTablePanel keeps expanded property/project bodies and contact actions at viewport width and counter-scrolls them independently.
- [x] Four focused scrolling tests pass; real signed-in homepage property checked at 411×801 and 1280×1800: summary scroll -180/-150, expanded body X unchanged and width matches viewport. Preview build OK; developer table shares the fixed panel but populated project flow is unavailable.

## Unified profile and popup property cards November 14
- [x] Profile list/grid and office assets reuse homepage StandardPropertyCard; remove profile mini-cards and duplicated quick-share row, retain authorized menus/favorites.
- [x] Standard cards, public detail pages and popup/expanded details share PropertyGallerySlider. Expanded details default to authorized photos/share/favorite; partner popup removes duplicate copy/pricing block and retains shared pricing trigger/contact row.
- [x] 35 focused tests pass; real populated profile and homepage cards checked desktop/mobile, next image 2/6, image enlargement, thumbnail selection and no overflow/runtime errors. Preview build OK. Partner popup source shares verified gallery; actual partner popup opening remains unverified because the available affiliate screen does not expose a property popup action.

## Complete open tasks November 14
- [x] Implement Grow via Make admin settings, self-owned checkout/notification contract, atomic payment-backed subscription records and conditional wallet purchase UI; unconfigured credentials/terms remain disabled.
- [x] Audit older open tasks and finish actionable dedicated campaign UI/sender routing and IVR recipient diagnostics; older paid/provider/publication/identity checks remain blocked as recorded below.
- [x] 44 focused tests pass; authenticated Grow sandbox settings saved/reloaded (enabled=false, no duration), email sender gate checked; mobile SMS has no attachment/preview duplication, viewport-bottom send bar above footer and no horizontal overflow. Workers deployed; build OK. No charges/messages/role changes/publication.
- [ ] Make scenario and separate sandbox/live webhook credentials plus notify shared secret are not supplied. Implementation contract: docs/grow-make.md. Subscription duration/benefits/renewal require owner decisions; no invented package or renewal enabled.
- [ ] Positive paid subscription activation, genuine IVR delivery, two-party community/Rita, historical bios/developer projects, provider scan results, Meta grants/publication, signup OTP/certificates, privileged rollback tests and historical costs/resource metrics need the external data/permissions/consent listed below. No false completion recorded.

## Public profile refinement November 14
- [x] Remove blue hero/title/back, place top-left Close, use 15px header-to-avatar spacing and display raw license; opt out of global heading hiding.
- [x] Save separate custom public bio; show 50+ character custom or source-attributed imported bio without a title above Send Message. Broker and developer import pipelines retain source bio without overwriting custom text or reusing private AI persona text.
- [x] Add same-office member/property directory and link for multiple matched members; matching requires saved brokerage name plus matching city/address, never an unqualified brand-name match.
- [x] Show developer projects through an allowlisted projection gated by existing published/live/unpaused project listings, never expose raw project data or auto-publish private developments.
- [x] 37 tests passed; authenticated desktop/mobile verified visible name/license, no hero/overflow, original bio save and reload, build OK; import workers deployed.
- [ ] Populated shared-office/developer-project flow and historical imported biographies require real matching office data, published developer projects and source biographies; no published developer projects or imported bios currently exist. No paid re-scrape or public publication performed.

## Grow payments November 13
- [x] Super Admin payment section adds Grow environment, business ID, phone and sending mode, configuration saving and no-charge test contract; OTP stays in Make, private webhook keys never appear in the panel.
- [x] Deployed server-created links and independently verified/idempotent notification contract through Make; approveTransaction acknowledges receipt. Missing Make scenario/keys prevent live execution.
- [x] Add separate ₪6,500 subscription order/entitlement records and purchase confirmation. Sandbox cannot grant live entitlements or wallet credits; custom terms remain unset and checkout disabled until supplied.
- [ ] Implement actual benefit entitlements and any renewal only after duration/benefits/renewal are specified; never grant broker licenses or bypass credit/workspace checks.
- [ ] Verify sandbox checkout and notification readback once Grow credentials are available; never treat a success redirect as proof of payment.

## Public profile layout November 13
- [x] Standard blue header with full-name title, Close/Back, centered avatar with full-screen preview, name/role/license and saved service cities.
- [x] Separate office identity box, remove duplicated activity section and outer profile/list frames, show authorized active-asset count. Existing public profile data provides one city, not a separate office operating-city list; display the available city without inventing others.
- [x] Four focused tests passed; real Doli profile verified at 1280×1800 and 411×801 with four authorized assets, no horizontal overflow and full-viewport avatar preview. Back returned to community inbox and exact nonzero list scroll (80→80); no user/listing data changed.

## Expanded list scrolling and WhatsApp share November 13
- [x] Lock the shared listing scroll owner horizontally while any property row is expanded; retain vertical and gallery scrolling, restore horizontal movement after all close.
- [x] Replace property WhatsApp template controls with automatic compatible approved-template selection, populated read-only preview and Send; reuse preview links/parameters for official delivery. Recipient name/phone remain necessary for direct delivery. Existing named property-alert template includes the landing link in its address variable without changing approved fixed text.
- [x] Authenticated real-property desktop/mobile expansion, vertical scrolling, horizontal lock/release and populated share preview checked. Delivery uses focused mocked gateway tests; no real recipient messaged. Existing approved batch template is unavailable in the current workspace, so batch WhatsApp sends fail closed rather than use an unrelated template.

## Multi-selection pricing November 13
- [x] Selected-assets publication opens shared lead prices and separate sale/rent closing settings, with individual overrides and retained untouched fields.
- [x] Single/bulk publication share zero-price detection and concise warning; inventory publication requires broker-only confirmation before saving.
- [x] Focused tests passed; authenticated desktop/mobile selection, shared pricing, individual entry and canceled zero warning verified. No live distribution changed; actual saves/publication exercised in tests.

## Publication pricing and pause confirmations November 13
- [x] Open saved pricing before inventory publication, save every confirmed setup before publishing, and show pricing again in the publisher's final confirmation. Creation/import remain private until explicit publication.
- [x] Route legacy partner activation through the same setup and require a cancelable impact warning before pausing distribution.
- [x] 25 focused tests passed, including save-before-publish, failed saves and pause confirmation/cancel. Build OK; authenticated real-listing pricing and pause warning checked on desktop/mobile. Actual publication/pause writes verified in tests only; no live asset distribution was changed.

## Rewards popup refinement November 13
- [x] Clarify advertiser commitments, hide closing sections without existing server-confirmed broker eligibility, remove daily targets from read-only pricing and add the shared price-level legend.
- [x] 23 focused pricing tests passed; build OK. Authenticated real-listing popup verified on desktop/mobile, including licensed closing prices and scrollable heatmap without horizontal overflow; non-broker hiding covered by tests.

## Community groups and broadcast channels November 11
- [x] Extend existing groups with descriptions, discussion/broadcast mode, owner-managed invitations and durable unread counts; broadcast posting and Rita require the owner server-side.
- [x] Update creation, managed/joined lists and chat; existing private broadcasts refresh authorized queries, and read cursors advance only in a visible active group.
- [x] Eight focused tests passed; database columns/policy read back, Rita deployed and build OK. Authenticated desktop/mobile showed no overflow and correctly denied ineligible creation; modal checked with eligibility intercepted, no writes.
- [ ] Successful group creation, member invitation, unread clearing and two-user live chat require an eligible agent/broker/developer session; the injected account is ineligible. No real members messaged or roles changed.

## Rita in private and community conversations November 11
- [x] Add member-managed groups, member-only messages/rosters and server-written Rita interaction logs with RLS; private data-free updates include groups and assistant logs.
- [x] Add summon controls to lead/private/group conversations with streaming answers, summaries and lead guidance, saved history and Stop; no external sends or automatic CRM writes.
- [x] Five tests passed; authenticated temporary lead Rita reply returned 200, persisted and retained context on follow-up; mobile dialog/group navigation checked without overflow/errors. Forged assistant inserts, non-owner member edits and non-member roster access rejected; test lead/logs removed; function deployed and build OK.
- [ ] Positive group creation/member messaging and Rita-in-group flow need an eligible agent/broker/developer session; current injected account has no community role. No real users messaged or roles changed.

## Inbox conversation tabs November 11
- [x] Add property/lead and community tabs with independent mounted conversation state and per-peer drafts.
- [x] Private data-free per-user broadcasts refresh authorized queries; community participant RLS, server-role directory and send checks applied. Four tests passed; authenticated desktop/mobile switches and invalid self-message rejection verified, no overflow/errors; build OK.
- [ ] Successful two-party send/readback and live event receipt need an authorized agent/broker/developer session; current injected account has no eligible community role. No messages sent to real users.

## Discovery performance November 11
- [x] Extract summary-card volume and filter against configured bounds before enrichment; unknown counts still require inspection.
- [x] Scope directory pagination to Herzliya and Tel Aviv; retain sequential pacing and checkpoints, migrate old scanning checkpoints safely.
- [x] Add service-only seven-day checked/disqualified registry; 48 focused tests passed, both workers deployed, preview build OK. Database readback confirms RLS and no anon/authenticated grants. No paid provider scan; live filtering and provider geography remain unverified under the existing live-import task.

## Agencies directory import November 11
- [x] Remove subtitle; use directory pages and scoped agency detail enrichment with separate cache keys and retained pacing/contact fallback.
- [x] 39 parser/queue/transport tests passed; both workers deployed and signed-in mobile verified subtitle removal; preview build OK.
- [ ] Live directory-to-broker/draft import remains unverified: no paid provider scan was run, and ordinary public fetch returns a challenge. Office-only cards never create invented personal identities; creation still requires explicit person/license and enough attributed listing links.

## Import resume and fresh pagination November 11
- [x] Skip daily-restricted/busy listings without pausing; persist the next pointer and keep provider 429 protection.
- [x] Start a fresh job with reset counters/search pages, safely retire old jobs only outside active leases, and remove the requested heading. Existing drafts and detail caches remain intact.
- [x] 28 focused tests passed; migration applied and queue worker deployed. Authenticated desktop/mobile verified real queue reads, parameter reset and Resume/New request payloads with writes intercepted; build OK. Paid live resume/new-job scraping was not run, so provider-to-draft end-to-end remains unverified.

## Manual user creation placement November 11
- [x] Move unchanged manual creation form out of broker import into an animated toggle under the users table heading, with the add button opposite the title.
- [x] Authenticated desktop/mobile verified opening, closing, invalid-phone save blocking and form absence from import; preview build OK and no page errors. Existing fields/save logic unchanged; no real account created.

## Web Unlocker audit November 11
- [x] Inspect exact request, cache TTLs, pacing, license-first completion and live failure logs.
- [x] Pin requested zone web_unlocker4, add sanitized request/response diagnostics, distinguish local daily limit from provider 429 without bypassing the limit.
- [x] 40 focused tests passed; live cache holds 1 fresh search page (4 hits) and 8 fresh details. No Bright Data-created broker rows exist, so full account/draft completion remains unverified without a successful paid import.
- [x] Both workers deployed; preview build OK. Completion endpoint rejects unauthenticated requests (401). No live provider request or authorized end-to-end account/draft creation was exercised.

## Web Unlocker request schema November 11
- [x] Use exact POST JSON body zone/url/format:raw and Bearer environment credential, supporting the existing saved key name.
- [x] Preserve existing raw HTML parsers, license-first missing-contact fallback, cache and checkpoint logic.
- [x] 36 focused request/parser/error/license-first tests passed; yad2-unlocker deployed and preview build OK. No paid live scan or end-to-end provisioning was performed.

## Bright Data managed transport November 11
- [x] Remove the three requested import/contact explanatory paragraphs.
- [x] Prioritize managed Web Unlocker HTML, retain managed Browser fallback, and route short-link resolution through Unlocker; preserve checkpoints and license-first pending contact. Internal status checks now authenticate service calls, bypass public cache and reject challenge/error shells.
- [x] 38 focused tests pass; three workers deployed, syntax and preview build OK. Authenticated mobile import tab/modal checked with all three texts absent; no paid scan started, so live provider success/429 prevention is unverified.

## Manual Bright Data cooldown reset November 11
- [x] Add confirmed Super Admin-only reset, clearing cooldown/error/retries while retaining paused status, checkpoints/cache and actor/time audit.
- [x] Keep REST requests non-sticky with provider-managed rotation and bounded peer diagnostics; no unsupported session parameter or guarantee of unique IPs.
- [x] Both workers deployed; 16 focused tests passed and build OK. Authenticated mobile performed real reset on isolated paused test job: retries 3→0, deadline/error cleared, page 7/cache hits 5 retained, Resume enabled. Test row removed without starting a paid scan. Live peer rotation remains unverified without provider requests.

## Low-frequency Bright Data processing November 11
- [x] Replace four-second pacing with a strict twelve-second sequential gap and delay-only steps.
- [x] Pause immediately on 429 with minimum five-minute persisted cooldown and manual-only resume.
- [x] Migration 0151 enforces cooldown in authorized control RPC; 19 tests passed and workers deployed. Authenticated mobile verified mocked paused countdown (299→297 seconds), blocked Resume and retained cache totals; build OK. Real provider 429/resume not exercised.

## Bright Data pacing November 11
- [x] Serialize provider fetches with a 4-second gap, keep one page/detail per leased import chunk, and preserve cache bypass.
- [x] Persist exponential 429 cooldown and bounded automatic retries with countdown; manual pause/resume retains checkpoints.
- [x] 18 focused tests passed and workers deployed; authenticated mobile import card verified with real read-only data and mocked 429 countdown (39→37 seconds). Build OK; paid provider retry/provisioning not exercised.

## Bright Data timeout and diagnostics November 11
- [x] Extend provider REST/browser requests to 120 seconds with enclosing response grace and credential-redacted status/payload logging.
- [x] Retain existing checkpoint/cache-based resume and explain the longer wait in import progress.
- [x] 12 focused transport/error/checkpoint tests passed; both workers deployed and preview build OK. No paid scan or real resume was run; live provider timeout/retry remains unverified. Local Deno check unavailable due package resolution.

## Automated admin workspace and broker import November 10
- [x] Simplify silent user creation with type selection and server-checked registry/manual fallback.
- [x] Replace pasted batches with target/min/max discovery, detail enrichment and durable per-broker/per-listing checkpoints.
- [x] Background progress and atomic pause/resume deployed; authenticated desktop/mobile verified parameter dialog, modal-independent real scan, pause/resume and paused readback after reload. Real registry 31927721 returned matching canonical name/city; no messages sent.
- [ ] Full discovered-broker provisioning/import cycle remains unverified; the real one-broker test is intentionally paused after three scan pages with zero accounts/listings created. Complete provider identity extraction and safe successful provisioning readback still need verification.

## Open marketing table scrolling November 10
- [x] Bound the marketing page to the existing shell and shared native two-axis table scroller, keeping title/controls/footer stationary.
- [x] Seven scrolling tests passed; authenticated 1280×1800 and 411×801 table wheel scrolling moved both axes while shell/document stayed at zero; native mobile touch swipes passed both axes with real rows.

## Inventory collection phase November 10
- [x] Add dismissible shared home/public-board notice with browser-persisted dismissal.
- [x] Keep social connections, GoLogin and network marketing visible with preparation dialogs; inventory import/edit/publication and existing server jobs unchanged.
- [x] 42 focused tests passed; public and authenticated home notice, reload dismissal and connected-account desktop/mobile preparation dialogs verified with no page errors. No external connection, property write or publication performed.

## Official broker invitations November 10
- [x] Add Super Admin official-send preview and editable template submission/status from the official number.
- [x] Track accepted invitation, authenticated entry and pending inventory approval; My Properties shows the current stage.
- [x] 13 focused tests passed; deployed authorization rejects invalid sessions; mobile admin dialog verified. Default template submitted and Meta returned REJECTED, so no invitation was sent.
- [ ] Real official sending needs a Meta-approved wording and a consenting broker.

## Inactive Yad2 imports November 10
- [x] Shared preflight and queued draft/skip prompt across pasted link, publisher, agency and search-result imports.
- [x] Manual inactive-listing saves allowed; exact-source deduplication and publication-transition safeguards retained in migrations 0140/0141.
- [x] Hide missing advertiser placeholders and fill internal editing gaps from the signed-in verified broker profile; public source attribution unchanged.
- [x] Authenticated mobile verified simulated inactive status/skip; real selected-property unchanged save returned 204 and reload succeeded. Focused tests cover unpublished draft payload; fresh removed-source draft creation and scrape remain unverified.

## Shared lead question configuration November 10
- [x] Shared expandable question/form-field builder added to publisher, reward and quick-publication lead cards.
- [x] Preserve per-channel defaults, explicit removals and custom field types in scoped saves and reward drafts.
- [x] Authenticated mobile/desktop verified form addition and WhatsApp/phone edit/add/delete with no page errors or real publication. Focused save-payload tests cover persistence; real question save/capture not exercised.

## Compact publication pricing November 10
- [x] Replace fee summary labels with icons and pencil expansion; remove account-limit editor and requested publication paragraph from this dialog only.
- [x] Per-tier limits default to blue underlined links, edit on click and return selected numbers to links; smaller input placeholder.
- [x] Seven focused tests passed; authenticated mobile verified draft limit 7 and four expanded sliders without saving or publishing.

## Property editing and expanded-card polish November 10
- [x] Authorized table pricing opens the existing editor with all four sliders and caps expanded; Super Admin read-first unlock preserved.
- [x] Shared advertiser evidence rejects generic names; original office branding replaces importing-workspace fallbacks, including established Anglo Saxon affiliation.
- [x] Vertical wheel, touch and mouse gallery gestures scroll the surrounding results; expanded menu sits at the top-left title edge.
- [x] Visible publication column title and boundary-contained sticky contact bar verified through the end of the expanded card.
- [x] 26 focused assertions passed across two runs; authenticated mobile/desktop verified four default sliders, loaded Tal Zano office logo/name/source license, gallery wheel/touch/mouse scrolling and footer boundary. Build OK; no real property values changed. Fresh Yad2 import and real pricing save not performed.

## Publication controls and permanent inventory protection November 10
- [x] Accurate public/broker-only confirmation, pause action, opposite footer actions and lead help; server feed restricts zero-lead offers to authorized brokers.
- [x] Closing-first sliders, three lead icons, interaction-only encouragement and per-tier daily caps.
- [x] Account-wide rolling-day paid-lead count and spend guard implemented; authenticated limit save/readback checked and test limits removed.
- [x] Exact-source duplicate prevention and terminal inventory protection; repaired search-URL overmatching and restored affected publication flags, retaining historical records.
- [x] 43 focused tests passed; authenticated desktop/mobile dialogs and help checked without page errors; build OK. Pause refresh deadlock covered by regression test.
- [ ] Transactional charging/tombstone SQL tests require privileged function execution unavailable to the sandbox connection; fresh import and publication cycle not verified end-to-end.

## Property presentation November 10
- [x] Restyle shared publication globes and remove visible publication heading while retaining reorder controls.
- [x] Place multi-select immediately before search without an adjacent selection checkbox.
- [x] Space edit actions and display original advertiser office/logo and broker/license using the existing authorized projection.
- [x] Signed-in desktop/mobile verified editing actions, loaded office logo, number-only license, adjacent selection/search, no toolbar checkbox and green/gray table globes; nine existing publishing/presentation tests passed and build OK. No property values or publication flags changed.

## Admin-led broker onboarding November 10
- [x] Admin broker setup requires explicit license approval, records service-owned silence, and never sends credentials; SMS/WhatsApp dispatch guards suppress recipient delivery before first authenticated entry (requested SMS OTP excepted).
- [x] Broker-specific public OTP invitation preview/copy available after creation and beside brokers in the users table; no login tokens/passwords in invitations.
- [x] First authenticated entry atomically selects own workspace and opens My Properties; later entries go home. Added selected-property closing-only batch editor using existing sale/rent dialog without overwriting other lead amounts.
- [x] 27 focused tests passed, build OK; real temporary broker created silently, authenticated via password without SMS, first entry reached /properties and subsequent entry /; temporary account deleted. Admin copy and authorized batch dialog checked. No real SMS OTP, fresh Yad2 scrape or batch price save performed.

## Open marketing properties November 9
- [x] Instant marketing appears only for actively selected visible properties; existing public-safe feed and authorized share actions retained.
- [x] Sharing Pool reuses home board cards/table, search and role-aware advanced filters; view/search controls opposite multi-select.
- [x] Authenticated internal navigation verified selection/deselection, no-match search, advanced panel and both views at desktop/mobile; 18 focused tests passed and build OK. Direct reload resets Partner Mode via existing workspace behavior; no permission bypass or change made.

## Automation pacing audit November 9
- [x] Inspected browser actions, messaging queues, claims/leases, retries and safety gates; read live schedules, post caps and aggregate activity. No production sends.
- [x] Prepared source-cited report with prioritized recommendations, live-vs-static evidence and runtime limitations. No automation changed; 15 existing group policy/discovery tests passed.
- [x] Included quick scan results (12 warnings/11 informational) and explicitly excluded the pending deep scan from conclusions; its notification will arrive separately.

## Manual broker approval November 9
- [x] Profile/admin distinguish registry מאומת from user+license-bound manual מאושר; historical approvals do not keep a removed license active.
- [x] Shared entitlement grants manual approvals closing/property access; broker registration accepts manual evidence without registry lookup. Removal deletes broker roles before clearing license and revokes manual/affiliate evidence; transfer trigger rejects borrowing approval.
- [x] 29 tests passed, build OK; authenticated mobile/desktop חגי אורן shows מאושר · מתווך פעיל, closing entitlement true and My Properties accessible. Another account cannot use 30625911. No page errors.
- [ ] Removal rollback SQL test is retained but blocked by the provided connection's function permissions; no real license removed. Partner Mode as the broker himself and a completed removal remain unverified without an approved broker session/privileged test connection; consent and account isolation unchanged.

## Broker registry identity November 8
- [x] Canonicalize official names separately from raw certificate evidence; update matching saved profiles, registry responses/review names and two matching ad contact names, leaving arbitrary people/office names unchanged.
- [x] Return confirmed profile/activation state, stop redundant post-verification writes, stabilize input callbacks and end checking on failure; distinguish locked verified evidence from server-confirmed active entitlement.
- [x] 26 focused tests passed, build OK. Live 31927721 lookup returned דולי אידלסון/הרצליה; authenticated mobile/desktop selected-owner profile showed מאומת · מתווך פעיל without identity editors or duplicate upgrade card. Server ignored attempted name/city edits. Fresh SMS/certificate-to-role onboarding was not exercised; existing ownership protections remain required.

## Campaign entry and accessibility November 8
- [x] Make every campaign plus action open the full channel picker, clearing only navigation context.
- [x] Integrate a locally bundled MIT accessibility engine with a sidebar-only trigger and Hebrew keyboard-accessible preferences.
- [x] Nine focused tests passed; authenticated SMS subpage plus opened all six channels. Mobile/desktop verified all preferences, keyboard Space/Escape, 200% bound, reset and hidden sidebar-only trigger without page errors. Build OK. Accessibility Review identified missing baseline input focus indicators (fixed); full-site semantic/screen-reader audit and Israeli/WCAG certification remain unverified, not implied by the widget.

## Profile completion warning November 8
- [x] Validate the displayed profile owner's saved name, city and phone without account/workspace mixing; absent/error/stale reads never generate missing-field claims.
- [x] Consume scoped confirmed-save readback immediately, refresh on focus and visible 30-second checks, and automatically remove completed warnings.
- [x] 12 focused tests passed; authenticated mobile/desktop profile showed saved הרצליה without a missing-city warning, unchanged city saved with 200 and persisted after reload without warnings or page errors. Incomplete-to-complete transitions covered by regression tests, not by clearing real personal data; build OK.

## Broker profile and partner switching November 8
- [x] Auth-bound partner activation requires current terms, retains identity and uses account affiliate roles; provisioning skips existing profiles and unrelated updates do not retrigger license freshness validation.
- [x] Lock official name/city for all viewers with server enforcement and existing verification evidence; registry fetching is only in failed automatic-fetch Super Admin pending review. Verification functions deployed.
- [x] 32 focused tests passed; authenticated mobile/desktop selected-broker profile has no name/city editors or registry button, partner activation returned 200 and selected partner menus without broker property tools, and switching back succeeded. Server rejected selected verified-profile identity overrides; build OK. Fresh registry scraping and first-time consent were covered by tests, not exercised live.

## Step 8 feedback November 8
- [x] Restore closing partner estimate and icons only in the publisher; retain other editors and price bounds.
- [x] Add interaction-only live encouragement for the three publisher lead sliders.
- [x] Focused pricing tests passed; signed-in shared Step 8 editor verified all three interaction-only messages and closing maximum estimate 100 on mobile, with desktop capture. Cancelled all price changes; build OK.

## Unavailable listing details November 8
- [x] Confirm reported owner slug is absent from saved listings; preserve the server's publication and workspace access checks.
- [x] Use immutable saved IDs for homepage expansion and show an explicit unavailable/retry state instead of empty expanded content.
- [x] 24 focused tests passed; authenticated mobile expansion loaded real details using UUIDs, absent reported slug displayed the unavailable page with no page errors, and build OK. No missing listing was fabricated or authorization changed.

## Import commission modes and expansion November 8
- [x] Remove Step 8 partner-count scaling and replace it with concise popularity text, preserving slider bounds.
- [x] Anchor expanded My Properties titles below stationary headers within the existing scroller; managed summary rows now identify their expansion anchor.
- [x] Split batch import commissions by actual sale/rent inventory, apply requested bounds/defaults and require legal acceptance before fee writes; preserve drafts on cancel and surface partial save failures.
- [x] 41 focused tests passed. Signed-in mobile/desktop expansion title sits 8px below the heading without document movement; import modal acceptance and real 0.21% fee readback verified with original values restored. Discovery/extraction were simulated using an existing authorized listing, not a fresh Yad2 scrape; batch/rental mode rules covered by tests. Build OK.

## Price controls and saving November 8
- [x] Add a visible semantic border to slider thumbs and place closing pricing before all other lead settings.
- [x] Reproduced HTTP 406 from the wrong workspace predicate; reward saves now resolve the authorized listing's saved workspace without weakening RLS.
- [x] 29 focused tests passed; authenticated mobile save returned 200, changed price persisted after reload, original price restored, and mobile/desktop slider borders and closing-first layout checked.

## Super Admin registry name lookup November 8
- [x] Add registry action beside broker license fields in selected-workspace Profile and Super Admin user editing, with wrapping mobile controls.
- [x] Deploy Super Admin-only official-registry lookup with exact stored-license checks, locked-identity protection, current registry evidence and persisted profile-name readback; no license approval or role changes.
- [x] Live admin button fetched license 31927721 as אידלסון דולי; UI and database persisted it after refresh. Invalid auth returned 401, invalid input 400; 15 tests passed including not-found and scope-switch cases. Desktop and 442×728 dialogs/profile inspected; build OK.

## Advanced search and shekel rewards November 8
- [x] Fix homepage dropdown and slider matching against whitelisted property facts and authorized reward data in the same paginated board feed; remove split deal state and skip no later pages after an empty eligible page.
- [x] Derive closing search bounds from current full-board net ILS values, independent of selected filters; no fabricated bounds when data is unavailable.
- [x] Display commission/reward badges in absolute shekels without changing stored agreements or visibility permissions; strip financial values from persisted board caches.
- [x] 104 focused tests passed; live signed-in property-type selection returned 7 matches, closing bounds 128–90400 and maximum threshold returned 1 match, form threshold returned 1 match with ₪120 net. Desktop/mobile inspected without page errors or horizontal mobile overflow.

## Imported inventory publication November 7
- [x] Fix workspace-role visibility and scoped publication with persisted readback and Hebrew failures; discard late workspace responses.
- [x] Verified existing listings RLS/grants permit active-workspace updates; no schema change or weakening of required pricing/license checks. No Facebook or credit dependencies.
- [x] Authenticated Super Admin in חגי אורן's workspace published imported property 01b77dc3-d7e6-459e-88ac-a45f0ed8f048 through the UI; public flags read back with 200 and persisted in the database. Broker-self access covered by regression test.

## Home controls bar November 3
- [x] Move search, sort and view-mode toggle below the site title and above the table on the signed-in home page; search far right, view toggle far left, sort beside it; no property count.
- [x] Share one sort menu with "הנכסים שלי" (src/lib/listingSortOptions.ts + src/components/ui/sort-dropdown.tsx); removed the duplicate header search/view controls.
- [x] 5 focused tests passed; signed-in desktop verified positions, the six identical options, ascending price re-order and no count. Build OK; the 9 failing suite tests are unrelated (phoneSession, signupRole, wallet, ai-brain, group chips).
- [x] Controls row now sits above the search panel and stays put when it opens (measured 0px move at 1280px and 393px); removed the magnifier inside the search field and the 12px space above it.


## Yad2 import cards November 1
- [x] Split the import slide into two framed cards: "יבוא כל המודעות שלי מיד 2" (exact office-page sentence, lighter placeholder, tip under the input) and "יבוא מודעה מיד 2" (statement under the title), office-page card first.
- [x] Import buttons appear only for a matching link (office page vs single ad), "המשך ללא ייבוא" is a framed outline button, the role heading reads "מי מפרסם?" and the top tabs have no arrows.
- [x] 8 focused tests passed (src/test/yad2ImportLinks.test.ts, src/test/yad2Publisher.test.ts); signed-in broker flow verified: no import request fired while typing, buttons appeared only for valid links, no runtime errors. No listing imported or published.

## Mandatory publisher entry November 1

- [x] Reset every explicit free-ad opening to publisher choice before sale/rent, including developer accounts; preserve scoped content and pricing-only recovery.
- [x] Keep broker verification and import authorization, and require ownership by selected private branch rather than account role.
- [x] 31 focused tests passed; guest and signed-in mobile opening, sale/rent back, cached reopening and private/developer declaration branches verified without runtime errors. Build OK; no listing published or license changed.

## Publisher cards and optional consent October 30
- [x] Move view toggle, anchor expanded steps, unify closing offer/percentage and rename Rita cards.
- [x] Reorder declarations and preserve optional marketing decision and authentication; 46 focused tests passed. Signed-in mobile verified 1% sale, 0.2–2% bounds, collapsed/expanded percentage and decline-to-confirmation with consent unchecked and no runtime errors. No listing published.

## Step 8 closing and consent refinement October 30
- [x] Closing first, required/zero styling, undefined sale 1% and rent 50%, matching percentage summaries.
- [x] Combined legal approval and final declaration wording; four Navy Blue legal links have no underlines. 42 focused tests passed; signed-in mobile rent 12000 → 6000 (50%), expanded/collapsed summary and approval checked. Build OK, no runtime errors; no listing published.

## Direct non-broker publication October 30
- [x] Skip publisher-type selections for partner/private publication and add mandatory owner declaration without changing broker/developer flows.
- [x] 27 focused tests passed; signed-in mobile direct entry skips both publisher selections. Declaration starts unchecked, checked state survives reload and can be unchecked. Build OK and no runtime errors; no listing published.

## Step 8 pricing refinement October 30
- [x] Empty focused price, five-digit reward visibility, exact lead titles, nonzero closing bounds and editable percentage/default.
- [x] Native board scrollbar and full-width collapsed rental/reward summary.
- [x] 25 focused tests passed; signed-in empty/9999/2000000 price visibility, 0.2–2% bounds, 1% default and 1.5% manual readback verified. Mobile/desktop collapsed rental summary checked with four rewards; build OK. No listing published.

## Logo and activity layering October 30
- [x] Logo label inside top-right of upload square. Body-level activity layer stays above page tabs with 5px backdrop blur; signed-in logo, topmost hit test, live properties, earnings tab and close cleanup verified. Nine focused tests passed; build OK and no runtime errors.

## Rita active-owner isolation October 30
- [x] Bind greeting and assistant name/role/gender to the authorized owner; caller authorization remains separate. Scoped history excludes unknown legacy transcripts; ai-agent deployed.
- [x] Remount all Rita surfaces on handoff and reject late events/responses; signed-in Shafi greeting, partner suggestions and live reply confirmed her exact name and affiliate role, without runtime errors. Real workspace switching was not exercised; regression tests cover handoffs.

## Office details and sticky tabs October 30
- [x] Fixed-height opaque sticky profile tabs, verified at 411px and 1280px.
- [x] Exclusive nationwide city selection; square-logo-only layout with inline name save and automatic logo/service-area saves; no outer card or global office save.
- [x] Eleven focused tests passed; signed-in nationwide save persisted alone after reload without saving a display-name draft. Original Ashdod selection restored and verified; no runtime errors. Logo upload was not exercised against real branding.

## Inline profile saving October 30
- [x] Save only the confirmed profile field; pencil becomes check while editing, no global save; metadata/cache merge only saved field values.
- [x] Exit and labeled account deletion below upgrade in normal flow with separator. Ten tests passed; signed-in mobile city confirmation restored pencil and survived reload; action position static and deletion opened confirmation without sending code. Build OK.

## Workspace publisher isolation and explicit upgrade October 30
- [x] Bind publisher identity to active owner, remount wizard state on scope change, block stale workspace refreshes and hide unvalidated cached context; profile hydration cancels stale reads.
- [x] Remove automatic broker prompts and contact-step license fields from standard publication; no broker choice for unverified workspace owners.
- [x] Add explicit “יש לי רישיון” upgrade entry; preserve SMS/certificate and identity authorization, with no submission on another owner's behalf.
- [x] 17 focused tests passed; signed-in 411px standard publication shows no broker option/modal/license input. Profile upgrade shows the new option; current session views another owner's profile, so submission remains correctly blocked. Build OK.
- [ ] Genuine self-account license verification requires an authorized account, received SMS and certificate; real multi-workspace contact readback requires a session with selectable workspace access. No role, phone or identity changed during checks.

## Publisher fees and verification October 30
- [x] ILS-first closing/sale fee values and limits; center ad type and restrict inventory import choices.
- [x] Remove colored field/dropdown focus borders globally while keeping neutral keyboard focus.
- [x] Require SMS and official broker verification before broker publication; protect verified identity server-side with pre-registry name and certificate checks preserved.
- [x] 33 focused tests passed; signed-in mobile/desktop broker selection opens required SMS gate, no My Properties for the current non-broker role; neutral focused field verified. No codes sent, property published or real identity changed.
- [ ] Genuine new broker OTP/certificate approval and successful publication readback require a recipient-controlled phone/code, authorized certificate and consent to publish. Positive verified-broker import UI remains unverified with the current non-broker role.

## Property-based service messages October 30
- [x] Remove fabricated SMS sample content; add searchable property selection below recipients for SMS, WhatsApp and email, and relocate IVR's existing selector there.
- [x] Reuse workspace-authorized/partner-safe inventory and selected-property generation; preserve Facebook/Instagram flows and approved WhatsApp templates.
- [x] Fifteen tests passed for template access, partner inventory, property variable binding, clearing and stale-response isolation; build OK. Signed-in mobile SMS selected a live property and generated content read back in the editor; WhatsApp and IVR menus are below recipients. No messages sent. Email interaction remains unavailable until a sender is configured; WhatsApp customization applies only to supported approved variables, not fixed template text.

## Service recipient presentation October 30
- [x] Match recipient placement and typography across SMS, WhatsApp, email and IVR; service-specific bold placeholders, bold selections and inline WhatsApp template placeholder.
- [x] SMS, IVR and WhatsApp signed-in mobile selection/readback verified: identical 17px/700 text, 362px width and top position; WhatsApp template typography matches. Twelve regression tests passed, build OK; no campaigns sent. Email retains its sender prerequisite; recipient interaction remains unverified because this workspace has no configured sender.

## WhatsApp templates October 30
- [x] Restrict broker invitation template listing and sending to Rita's workspace; restrictive cache RLS and deployed send checks.
- [x] Hide resolved variables and duplicate free-text editor; align counters and personalization toolbar.
- [x] Five focused tests passed, non-Rita live send request rejected with 403 before delivery, signed-in mobile WhatsApp shows one approved message with inset counter and no invitation or variable input; build OK, no runtime errors. No messages sent. Email toolbar visual check not completed because channel state stayed WhatsApp.

## Partner campaign picker October 30
- [x] Use the shared public-safe available partner inventory instead of workspace-owned properties in partner context; preserve listing IDs and exclude closing-only offers for unverified partners.
- [x] Ten focused tests passed including pagination and privacy. Signed-in partner workspace fetched five shared rows, showed four audience-eligible choices plus clear selection, and selected address/price/photos read back; build OK, no runtime errors. No campaign published.

## Facebook chooser disconnection October 30
- [x] Add workspace profile disconnection/account switching and independent Page disconnection; remove group shortcuts.
- [x] Show profile connection first when disconnected; 17 focused tests passed and signed-in 442px preview checked. Fixture-backed Page removal, profile disconnect and reconnect dialog verified without changing real connections; build OK and no runtime errors.
- [ ] Real new-account login and Page authorization readback await a user-controlled Facebook login and usable cloud runner/Page grant; no real connection was disconnected during verification.

## Personal profile and tasks October 30
- [x] Outline default avatar, matching full-name field and fixed profile tabs with 10px less top spacing.
- [x] Show unverified workspace profile upgrade without submitting another person's verification.
- [x] Personal task creation, editing, completion, schedules and empty-state add controls without tours; rename page מטלות.
- [x] Ten focused tests passed; signed-in 442px profile upgrade/pinned tabs and task create/edit/complete/reload/delete verified; build OK, no runtime errors. External reminder delivery not verified.

## Publisher-style filters October 30
- [x] Share publisher room, floor, amenity, condition and entry menus; preserve reward sections and role visibility.
- [x] Match selected options against saved listing facts; 20 focused tests and signed-in menu selection/readback passed.

## Shared property filters October 29
- [x] Reuse public filters in Properties, align below search over the hidden options row, enable scrolling and preserve page position.
- [x] Placeholder-only fields, opposite icon-only close, exclusive nationwide selection, extra 5px below blue section.
- [x] Seven tests passed; live signed-in phone layout has matching 368px widths, internal scrolling, working price filter/reset/close and unchanged page position; no runtime errors, build OK.

## Partner navigation and properties spacing October 29
- [x] Plain property count with נכסים and fixed 15px toolbar spacing; measured phone layout.
- [x] Strict partner/private navigation and route presentation; personal tasks and existing partner transaction RPC view, with separately scoped private transactions.
- [x] Focused tests and signed-in broker inventory checked; simulated partner navigation/redirects/tasks/transactions checked without runtime errors. No real partner/private account session was available for positive-data verification.

## Account personalization and activity October 29
- [x] Correct personal Rita identity without changing authorized workspace data context.
- [x] Hide broker-only partner/private navigation and simplify their dashboard/activity; preserve broker My Properties and reuse public-safe sharing inventory.
- [x] Close Facebook Page menu on every action and resolve settings/groups loading stalls; use the same selector in connected profile settings without a duplicate Page display.
- [x] Focused rule tests and signed-in mobile activity/groups checks passed; no runtime errors. Real Page linking/removal remains untested because the current workspace has no saved Page grant (see Facebook connection blocker below).

## Facebook Page connection October 29
- [x] Route Facebook connect/add-Page buttons into one in-app cloud connection window; remove unrelated settings and direct OAuth redirects.
- [x] Reuse server list_pages/select_page authorization and retain existing bindings; no login when authorized Pages are available.
- [x] Reuse the cloud browser tab and active session without group import for Page linking. Twelve focused tests passed; live signed-in window opened, simulated mobile additional-Page selection retained both Pages without OAuth; no runtime errors, build OK.
- [ ] Complete real additional-Page linking/cloud-only new Page authorization: current workspace has no usable saved Page grant, and the cloud runner has no official Page authorization/token exchange capability. Cloud login alone cannot grant Page publishing permission; no real Page was linked.

## Property page access October 29
- [x] Restrict technical Bright Data warnings to the signed-in Super Admin, independent of workspace.
- [x] Share account-scoped verified-broker/developer checks across navigation and direct routes; retain My Ads with separately owner-authorized editing.
- [x] 30 focused tests passed; live verified-broker inventory and My Ads loaded, non-developer project access redirected, simulated owner-role route/navigation denial checked; no runtime errors, build OK. No real developer or Super Admin session was available for their positive-path checks.

## Publisher card corrections October 29
- [x] Remove switches; center expanded prices only above sliders; halve icons and move help to top-left.
- [x] Exact gray zero-offer text; discrete zero then min-to-max scale verified across all four sliders; 29 tests passed.

## Publisher threshold sliders October 29
- [x] Apply zero-or-minimum thresholds to four sliders; live first movement and back-to-zero transitions verified, plus sale/rental threshold tests.
- [x] Match collapsed offers and keep thin, gray-at-zero icons in both states; mobile/desktop views and all four zero-icon colors/strokes verified.

## Publisher pricing card alignment October 29
- [x] Unify closing and lead card headers, icon strokes and edges; place titles/help below prices.
- [x] Verify expanded/collapsed controls and zero defaults: 14 focused tests passed; mobile/desktop cards and closing edit to 1% checked without publication.

## Platform-wide document October 29
- [x] Two-column intermediate grids, shared-row photo alignment and existing bounded footer; 320/446/768/1280px checked.
- [x] Explicit closing-only audience predicate reused on board, account ads/activity and favorites; preserves guest browsing and unknown/redacted rewards. Signed-in board shows 7 versus 8 guest cards.
- [x] Single-row silver contact actions, no Rita photo, red/green/blue controls and bottom-sheet forms; no text overflow at checked widths. Guest card/table sharing opens the same property-share dialog.
- [x] Audited existing server Page selection, bounded cancellable scans, social publishing/direct-window actions, unsortable תגמולים, certificate document matching, legal notices and rotating final footer; preserved. Restored exact auth logo spacing.
- [x] 54 focused tests passed; live guest/signed-in lists, mobile sheets, share dialog and aligned photos verified; build OK. Inquiry requests tested with mocked gate only, no real lead/callback created.
- [x] Certificate-based identity upgrade and universal OTP code excluded: neither safely proves account ownership.
- [ ] External checks remain blocked: genuine certificate/new-account completion, renewed Facebook authorization, successful scan-worker results and explicitly approved real post readback (see existing sections below).

## Broker certificate verification October 29
- [x] Add certificate upload, OCR and exact registry matching as a document-only check; no certificate-based role or verified-status upgrade. Deployed; 21 focused tests pass, authenticated non-certificate rejection verified through the live endpoint and upload control; build OK.
- [ ] Verify a successful match with a genuine broker certificate and the full new-account signup screen; requires an authorized certificate and new-account session. Existing-account isolated upload control was tested without changing roles.

## Signup and profile controls October 26
- [x] Two deal buttons, gender-aware details title, aligned city/property menus and visible last Other option.
- [x] Larger profile text, full-circle avatar with outside camera/trash, live completion notice and fixed office save.
- [x] Multi-select service areas with nationwide first; bold menu and publish text +2px with unchanged frame.
- [x] 24 focused tests; signed-in 446px profile, 94px avatar, 97x40 publish frame, visible Other and office save verified. Service areas saved/read back and original empty selection restored. New signup completion and uploaded-avatar deletion were not repeated.

## Signup celebration and reward polish
- [x] Four lead icons and explicit-zero labels without restricted-price leaks; sidebar fonts -3px, publish text +3px, empty bell hidden, glyph sizes changed without frame changes.
- [x] Immediate type-specific welcome, seven-second full-height falling confetti and generated ElevenLabs sounds; server-configurable atomic signup bonus (initial default 500 credits) read from the actual grant. Legacy intros no longer cover the welcome.
- [x] Account-only confirmed lead/referral/closing earning sound, cached once and enabled after user interaction; no playback for historical grants, adjustments or topups.
- [x] Focused tests and real fictitious-phone signup verified: 500-credit welcome, seven-second cleanup, close/reload without repeat welcome; header frame 36px and chart glyph 23px, publish frame 97x40 with 16px text; build OK. No real commission generated during testing; injected account has no Super Admin access to settings.

## Signup details and gender October 26
- [x] Match signup language to chosen gender; extra logo space, back controls, smaller footer and matching headings.
- [x] Separate type picker from details; city and property menus, owner sale/rent, developer import link, license placeholder without signup disclosures; owner deal persists through constrained RPC.
- [x] Fix unbound RPC causing undefined rest error; 37 tests pass, phone UI navigation and live authenticated rejection/friendly error verified without changing the real user's identity; build OK.
- [x] Successful fictitious-phone account completion and actual bonus readback verified in the signup celebration task; no existing real-user identity changed.

## Profile gender and personalized language
- [x] Rename gender selectors globally to גבר/אישה; keep canonical male/female in existing constrained profiles.gender, remove metadata/cache fallback.
- [x] Add auth-user-keyed language context, shared authored-control localization and profile preference controls including when viewing another workspace; read back saved rows before context update.
- [x] Share explicit male/female/neutral helper for controls, selected toasts, notifications and email; SMS/WA system slots query actual recipient profile, fixed approved WhatsApp text untouched. Existing neutral text and user/property content stay unchanged; arbitrary legacy sentences are not machine-rewritten.
- [x] Verified real female save, immediate command change, reload persistence, male switch and original preference restoration; focused tests cover recipient resolution/account isolation. External message delivery not exercised; no message sent.

## Platform alignment October 26
- [x] Auth spacing, bold larger fields, ten-digit formatted mobile and reversed OTP boxes; keep real server OTP verification, no universal bypass.
- [x] Guest table share reuses image-card dialog; social publication opens matching tailored dialog; public landing opens synchronously without prompts; edge-align table settings.
- [x] Standardize visible rewards to תגמולים and block reward sorting in public/shared tables while retaining reorder.
- [x] Contain global footer and enlarge legal links; selected Page requests explicitly scope to authorized workspace and surface discovery errors.
- [x] Verified guest/signed-in publication dialogs, matching guest share, direct landing tab and 320/411px plus desktop footer; 23 focused tests pass and preview build OK.
- [ ] Real Facebook Page selection and successful group results await renewed Graph authorization and external scan-worker results.

## Facebook Page selection and bounded group scanning
- [x] Reuse server Graph managed-Page discovery and authorized selection under campaign header; OAuth return opens existing Page picker, name/photo refresh on return.
- [x] Bound full group scan including hung initial/status requests to 60 seconds; cancel on discovery close/workspace change, preserve structured server failures.
- [x] Center group headings with official Facebook brand icon and clean manual-link placeholders; 18 focused tests and build OK.
- [x] Signed-in real group scan stops at 60 seconds, displays timeout reason and re-enables search; centered header/placeholder verified. No post published.
- [ ] Live Graph selection awaits renewed Page authorization (server reports no saved user token). Successful scanning awaits the external worker returning results; current jobs remain processing without callback despite active session.

## Final post footer and composer alignment
- [x] Verified existing +3px modal scale (21px heading, opposite-side actions) and two-credit confirmation regression tests without adding another increase or making a new charge.
- [x] Gallery tile and thumbnail image edges match exactly at 411px; clockwise 45-degree handles verified. Telephone emoji cleanup covers generation, polish, variations and final publishing.
- [x] Added service-only durable retry-keyed 10-sentence final footer for Graph Facebook/Instagram, cloud/claimed group posts and YouTube; deployed seven functions. Nineteen tests pass; client allocation/read denied; rotation 0–9–0 verified. No post published.
- [ ] External final-post readback awaits an explicitly approved real publication and a usable target connection; no Facebook or YouTube post sent during verification.

## Dialog readability and extra draft approval
- [x] Increase shared modal/pop-up typography by 3px and place Cancel/Submit on one row at opposite ends; mobile confirmation verified at 411x802 with 21px heading, 17px body/buttons and opposite aligned actions.
- [x] Fix confirmed two-credit draft renewal independently of publication pricing; preserve successful-only idempotent settlement and request ID. Six tests passed; signed-in approval generated a new draft (200), advanced batch 3 to 4 and recorded exactly 2 credits once. Build OK; no post published.

## Bright Data audit and optimization
- [x] Add Super Admin report with feature/API/cache breakdowns, recorded app credits, provider costs kept distinct, daily activity and export; signed-in report verified.
- [x] Instrument REST/browser calls; shared atomic non-sliding caches for developer/sections/status reads, deduplicated bounded developer batches; preserve daily item claims and scheduled slots and report failed scheduled responses truthfully.
- [x] Add non-disruptive alerts and optional foreground live refresh; 14 tests passed, schema denies anonymous reports and client cache claims; build OK.
- [ ] Exact historical provider costs and observed savings await available Bright Data billing detail and comparable post-deployment traffic; report currently marks costs unavailable.
- [ ] Live CPU/memory utilization history awaits a backend resource-metrics interface; current health snapshot does not supply continuous utilization.

## Post composer controls
- [x] Increase input fonts by 2px, retain bottom-left manual textarea resizing and remove content counter.
- [x] Add touch-pointer thumbnail handles with keyboard fallback; show saved effective Facebook Page below setup heading without legacy token gating.
- [x] Ten focused tests pass; signed-in mobile image 1-to-3 and restore, auto-expansion, desktop manual resize and screenshots verified; build OK, no publication.
- [ ] Live Page name/photo check waits for a saved Page binding in the active workspace; none returned during verification.

## SMS-only registration and intro
- [x] Update final intro signup/swipe exit and outlined header login action.
- [x] Replace auth UI with validated split names, gender and mobile; SMS OTP only, no master-code path.
- [x] Persist profile details through verified-phone RPC and collect five post-OTP user types with essential fields, preserving license and consent checks.
- [x] 36 focused tests pass; mobile/desktop registration and login, final intro CTA, 50px logo and server rejection checks verified; build OK.
- [ ] Real SMS delivery and new-account OTP-to-role completion require a recipient-controlled phone and received code; no SMS sent or test account created.

## Platform publishing and privacy updates
- [x] Add shared server-record identity redaction to generation and Graph/cloud publication; shared landing reuses canonical original advertiser projection; generated short links use toraff.co.il.
- [x] Add cyclic image navigation and confirmed deletion in campaign, listing wizard, projects and media library.
- [x] Add stored Business Page photo/name and named crossposting choice; one-click cloud group import offers keyword discovery when empty.
- [x] Split social draft price into 2 credits / per post and enlarge toolbar icons 30% with 6px bottom gap.
- [x] 45 focused tests passed; signed-in mobile composer and image next/cancel checked; build OK; no post published.
- [ ] Business Page-only cloud acting identity and full live import: requires server-confirmed Page acting identity from the cloud runner, absent in current session contract; existing GoLogin launch access remains blocked. Page badge unverified live because current workspace has no Page binding.
- [ ] Private-owner social identity exception: remain anonymous until the server can verify the actual publishing user owns the private listing and the target groups; no client identity bypass added.

## Cloud campaign publishing validation
- [x] Cloud group publication uses server-confirmed sessions and the background cloud runner without Page tokens; confirmation shows GoLogin connection, and Graph credentials stay required for Page/Instagram.
- [x] 22 tests pass; signed-in confirmation displays active GoLogin with zero Page targets. Validation correctly requires selected groups; no post sent. Actual dispatch cannot be tested in this workspace because it has no available groups.

## Secure Facebook cloud guidance
- [x] Add mobile-friendly guidance before cloud login, safe new-tab fallback and server-confirmed status checks.
- [x] Reject client credential/cookie uploads; deployed endpoint rejects synthetic password input; disclose encrypted session storage accurately.
- [x] All 17 privacy/connection tests pass; signed-in guidance and provider-error state reviewed at 411x802 and desktop; build OK.
- [ ] Complete actual Facebook login/group import: GoLogin still refuses Cloud Browser launch for the configured account (403); no Facebook password entered or requested by TORAFF.

## Super Admin user deletion
- [x] Permanently deleted Barak Israely: 327 active records purged; verified zero login/profile/roles/files/listings/workspace memberships.
- [x] Added shared confirmed multi-select deletion to API-settings and Super Admin users. Seven tests pass; signed-in two-account selection/confirmation canceled safely, Barak absent in search; build OK.

## Selected-property actions
- [x] Preserve the clicked property's identity through Facebook connect-later, draft restoration and generation of the post/first comment; late connection checks cannot undo skip.
- [x] Check shared action target paths; 22 regression tests pass and signed-in generation verified on two public properties with matching selector, photos, post and first comment. No post published.

## Profile action bar visibility
- [x] Keep the sign-out / save-profile row pinned at the bottom of the profile screen on phone-sized viewports, resting above the legal footer; other tabs keep their normal bottom gap. Browser-verified at 446x728 and 1280x900, build OK.


## Auth and property consent forms
- [x] Keep auth submission visible and disabled until valid; silently validate names on client and server. 37 focused tests passed and authenticated server validation checked.
- [x] Align publisher header corners, bold expanded titles and move marketing consent above square legal checkboxes.
- [x] Verified signed-in draft opt-out opens explanation, continues to explicit confirmation and keeps consent off; no property published during verification.

## Workspace card identity
- [x] Show the owner's full name as the workspace title for individuals (office/company names kept for branded workspaces) with the mobile below, in the sidebar card, workspace list and login picker.
- [x] Server-owned is_office/owner_phone flags in get_my_workspaces (phone only for the owner or Super Admin); 6 identity tests pass, signed-in drawer verified, build OK.



## Selected-workspace closing display
- [x] Allow Super Admin display to follow the authorized selected owner's official broker eligibility, without changing payout eligibility.
- [x] Refresh entitlement and authenticated redacted property data on workspace switches; 42 focused tests pass. Signed-in Super Admin switched through UI to Udi's workspace (server true, closing prices visible) and back to unlicensed workspace (server false, all broker-only labels restored); build OK.

## Licensed-only closing display
- [x] Replaced role-only/Super Admin/test-license closing entitlement with current official registry evidence and server-verified licensing; shared displays fail closed.
- [x] Gray closing icon and broker-only popup reuse saved course/exam links; 39 focused tests pass, guest and signed-in board popup checked, signed-in server denial confirmed and current build OK.

## Pricing editor corrections
- [x] Fix zero form-fee saves and Super Admin cross-workspace pricing edits without widening other permissions; reload authorized data before reopening.
- [x] Align pencil/red dot opposite close; remove read-only footer; collapse questions and show configured form fields.
- [x] 54 focused tests pass; signed-in Super Admin disabled form fee, saved/reopened and verified zero, then restored original 100. Mobile screenshots and current build checked.

## Consistent zero-fee lead indicators
- [x] Show four ordered types for guests, Super Admins and brokers across shared indicators and pricing details.
- [x] Mark known zero fees gray without exposing restricted amounts; 32 focused tests pass, guest and signed-in table indicators and guest pricing dialog verified.

## Weekly notification quiet hours
- [x] Remove selected notice and add global/day-specific quiet-time controls.
- [x] Persist and enforce weekly schedule; test overnight intervals and saved settings.

## Property card presentation
- [x] Show authorized commissions inside the original publisher section in grid and full details.
- [x] Keep favorite/share controls above images and make close controls icon-only.
- [x] Enlarge mobile contact labels and keep form/WhatsApp in one row; verify live views.

## Current request
- [x] Rewrite legal pages and add commission mechanism with shared logo and footer link.
- [x] Remove property landing headers and preserve configured contact/share actions.
- [x] Align service price with service title.
- [x] Implement workspace-authorized Facebook/Instagram draft billing: successful batches, explicit renewal confirmation and idempotent usage ledger.
- [x] Adapt Instagram connection presentation and verify documented provider capabilities.
- [x] Run focused tests and browser verification of legal pages and live draft billing, including cancel and approval.
- [ ] Full Instagram direct login, two-way DMs and comment automation: blocked on configured Instagram product, permissions and Meta access approval for customer accounts; existing Page connection alone does not grant these capabilities.

1. [x] Facebook first and Instagram adjacent already implemented in both channel lists.
2. [x] Campaign Facebook entry uses connection-only flow and link-style skip; security guidance remains inside its dialog, property widget preserved.
3. [x] Dedicated WhatsApp already has connection/skip flow; approved-template rules unchanged.
4. [x] Email sender gates recipients during loading and until a selected available alias/Gmail; immediate dispatch explicitly honors selection without silent fallback. Alias readback resets/discards stale responses on workspace changes.
5. [x] Dedicated email/SMS/WhatsApp remove attachment/record actions and duplicated channel preview, preserve placeholders, use “בחירה מהמערכת”, and portal the fixed send bar above legal footer with content clearance.
6. [x] Apply shared dedicated-channel presentation cleanup; legacy multichannel functionality retained.
7. [x] 44 focused tests and build pass; authenticated desktop/mobile Grow, email sender gate and mobile SMS bar checked without sending. Positive transport remains externally unverified.

## Icon-only reward indicators where no price shows
- [x] Compact indicators (table תמלוגים column, cards) show only the grayed icon for zero fees and restricted closing; ללא עמלה / למתווכים בלבד stay inside the pricing window.
- [x] 35 focused tests pass; guest and signed-in table cells and the guest pricing window verified in the browser; build OK.

## Card 8 and unified pricing window
- [x] Show immediate live pricing summary independent of consent; enlarge property prices and lead icons by 80%.
- [x] Route every reward icon to its master pricing window, with inline licensing links and grayscale broker label.
- [x] 34 focused tests passed; signed-in Card 8 showed ₪7,000, ₪40/50/80 and ₪700 closing immediately as complete without consent. Guest trophy opened one pricing window with inline course/exam links. Mobile screenshots and build OK; no listing published.

- [ ] Facebook cloud connect: service key saved; actual remote browser launch remains dependent on GoLogin account Cloud Browser access.
- [x] Consent-only broker invitation emails in batches of 25, with unsubscribe
- [x] Link-free official WhatsApp invitation wording (needs Meta approval)
- [x] Group import of Bright Data brokers with their listings as drafts
