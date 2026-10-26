# Roadmap

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
