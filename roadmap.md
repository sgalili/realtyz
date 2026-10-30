# Roadmap

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

1. [ ] Channel order: Facebook first, Instagram next to it (channel selection lists)
2. [ ] Facebook two-step flow: clean connection box (blue button, white FB logo, "חיבור באמצעות פייסבוק", "אתחבר יותר מאוחר" skip link, remove header/cloud/explanations/group search) → publishing screen with "קידום נכס מהמאגר" widget
3. [ ] Same two-step flow for WhatsApp channel
4. [ ] Email campaign: sender config (Toraff domain username picker / Gmail Google login), require before recipients
5. [ ] Email page: floating bottom bar fixed only at bottom; remove email preview box; placeholders "שם הקמפיין"/"תוכן ההודעה"; remove attachments row; remove outer container around list buttons; rename to "בחירה מהמערכת"
6. [ ] Apply same cleanups to WhatsApp + SMS setup windows
7. [ ] Typecheck, tests, browser verify

## Icon-only reward indicators where no price shows
- [x] Compact indicators (table תמלוגים column, cards) show only the grayed icon for zero fees and restricted closing; ללא עמלה / למתווכים בלבד stay inside the pricing window.
- [x] 35 focused tests pass; guest and signed-in table cells and the guest pricing window verified in the browser; build OK.

## Card 8 and unified pricing window
- [x] Show immediate live pricing summary independent of consent; enlarge property prices and lead icons by 80%.
- [x] Route every reward icon to its master pricing window, with inline licensing links and grayscale broker label.
- [x] 34 focused tests passed; signed-in Card 8 showed ₪7,000, ₪40/50/80 and ₪700 closing immediately as complete without consent. Guest trophy opened one pricing window with inline course/exam links. Mobile screenshots and build OK; no listing published.

- [ ] Facebook cloud connect: service key saved; actual remote browser launch remains dependent on GoLogin account Cloud Browser access.
