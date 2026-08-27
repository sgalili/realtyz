---
name: Tenant isolation + new-user product tour
description: Workspace-scoped RLS on listings/social_connections/campaign_settings, ProductTour dialog, header graphic logo.
type: feature
---
- RLS hardened for isolation: `listings` SELECT/UPDATE/DELETE are workspace-scoped for `authenticated` (own user_id, `shares_workspace_with`, or super_admin); published+live listings remain readable by `anon` only (public share pages). `social_connections` select scoped by `created_by`; `campaign_settings` select allows `updated_by IS NULL` defaults plus own/workspace rows.
- Never add blanket `USING (true)` select policies — new workspaces must start with an empty slate.
- `src/components/tour/ProductTour.tsx`: 6-step big-text RTL tour rendered from `AppLayout`. Completion stored in `onboarding_progress.metadata.product_tour_done` + localStorage `realtyz-product-tour-done:<uid>`. Step 5 explains per-active-contact pricing (₪2.5 / ₪2.0 / ₪1.5 tiers, charge stops immediately when a contact is removed/disabled).
- App header shows the graphic Realtyz logo (`src/assets/realtyz-logo.png`) instead of the "Realtyz AI" text; white-label logo/name still wins when configured.
- Landing has an "all-in-one replaces external tools" section (no competitor names) and the infra ticker titled "תשתית טכנולוגית".
