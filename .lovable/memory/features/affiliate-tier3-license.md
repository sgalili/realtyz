---
name: Affiliate tiers & tier-3 license gate
description: Levels 1-2 are digital marketing / lead-gen fees for all partners; level 3 (deal closing) requires a verified broker license
type: feature
---
Legal model (HARD): affiliate levels 1 and 2 are digital marketing and lead-generation fees (exposure/link sharing, verified lead + scheduled meeting) and are open to every partner. Level 3 is a brokerage deal-closing commission and is restricted to holders of a verified רישיון תיווך, per the Real Estate Brokerage Law.

Implementation:
- `affiliate_profiles`: license_number, license_holder_name, license_status ('none'|'pending'|'verified'|'rejected'), license_submitted_at, license_verified_at, license_verified_by, license_rejection_reason, terms_version, terms_accepted_at.
- RPCs: `submit_affiliate_license`, `review_affiliate_license` (admin/super_admin only), `accept_affiliate_terms`, `affiliate_tier3_eligible(uuid)`.
- Triggers `trg_submissions_tier3_license` / `trg_referrals_tier3_license` force tier3_amount = 0 for partners without a verified license.
- Frontend: `src/hooks/useAffiliateLicense.ts`, `AffiliateEligibilityBadge` ("מתווך מאומת" vs "משווק דיגיטלי"), `AffiliateLicenseCard` (in the רווחים tab), `CommissionTierBadges` prop `tier3Locked`, level 1/2/3 progress tiles in AffiliatePortal, terms consent checkbox in AffiliateSignup (AFFILIATE_TERMS_VERSION).
- TIER_LABELS wording: שלב 1 דמי חשיפה ושיתוף / שלב 2 דמי ליד מאומת ופגישה / שלב 3 עמלת סגירה לבעלי רישיון.
