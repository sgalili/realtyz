# Realtyz AI+ — landing cleanup, role step, super-admin switching, digital signature

## 1. Landing page cleanup (/landing)
- "כניסה למתווכים" in the footer becomes a link to `/dashboard` instead of the support email.
- Remove the star icon next to it and the empty starred line at the bottom of the footer (drops the `Star` import if unused).
- Remove the thin divider line above the "כל מה שמתווך צריך" title.

## 2. Sign-in / sign-up role step (/auth)
- Delete the always-visible "אני נרשם בתור מתווך / שותף" box (and its descriptive sub-lines) from the main sign-in screen, so signing in is just: pick channel, get code.
- After the code (WhatsApp, SMS, email) or Google login succeeds, check whether the account already has a role. Existing accounts go straight into the app as today.
- Brand-new accounts see a clean full-screen step with exactly two buttons: **שותף** and **מתווך**, no slogans or sub-text. Picking one registers that role and lands the user in the matching quick onboarding (broker → dashboard onboarding, partner → partner portal).

## 3. Super-admin account & workspace switching
- Grant אודי ויטמן (0522973500, udivitman@gmail.com) the super-admin role.
- The sidebar switcher becomes a real dropdown for super admins even when they have one workspace of their own: it lists every account/workspace on Realtyz (including ריטה's account and Udi's own) with a search box, avatar/logo, name and email.
- Switching clears all cached data so nothing from the previous account leaks, and switching back to Udi's own account is one click. Non-super-admins keep today's behaviour exactly.

## 4. Digital signature before a property tour
- Reuse the existing signing engine (document generation, secure signing page, WhatsApp send, signed-PDF storage) and add a new pre-tour agreement template: broker + client details, property, tour date, agency/commission terms, signature block.
- New reusable "חתימה דיגיטלית" dialog: pick the contact, optionally a property, set the tour date, generate and send the signing link by WhatsApp, and see live status (טיוטה / נשלח / נצפה / נחתם) with copy-link and resend.
- Entry points: contact rows and the contact profile in אנשי קשר, the property screen/modal, and the deal room card.
- Once signed, the document is attached to that contact's record and visible on the contact profile with the signed date and a link to the signed PDF; the contact's timeline logs sent/viewed/signed.

## Technical notes
- Landing/auth changes: `src/pages/Landing.tsx`, `src/pages/Auth.tsx`, plus a new `RoleChoiceStep` gate wired through `applyPendingSignupRole` in `src/lib/signupRole.ts` (role detection via `user_roles` / `affiliate_profiles`).
- Migration: insert `super_admin` into `user_roles` for `8f66ac1a-070a-4485-ac3b-07697d6c4b9e`; add an admin-only `list_all_workspaces()` security-definer RPC (falls back to `get_my_workspaces` for everyone else) so profiles without a membership row are still switchable.
- Switcher: extend `useWorkspace` to load the admin list when `useUserRole` reports super admin; update `WorkspaceSwitcher.tsx` with search + always-on dropdown.
- Signature: extend `supabase/functions/generate-closing-doc` with a `tour_agreement` template (Hebrew RTL body) and reuse `send-closing-doc` / `sign-closing-doc`; new `src/components/signature/SignatureDialog.tsx` + `useLeadSignatures` hook querying `closing_documents` by `lead_id`, wired into `LeadCRM`, contact profile, property view and `DealRoom`.
