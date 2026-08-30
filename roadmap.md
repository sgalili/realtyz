# Realtyz Project Roadmap

## Active Tasks

1. [DONE] Show 3 metric cards in the same row on mobile view (`Landing.tsx`)
2. [DONE] Auto-link Gmail, Calendar, and YouTube on initial Google Sign-In
   - Added `google_all` combined scope to `socialAutomationService.ts`
   - `Auth.tsx` sets `realtyz-google-services-pending` flag on Google login
   - `CommandCenter.tsx` auto-redirects to combined Google consent when flag is set
   - `OAuthCallback.tsx` handles `google_all` state and clears the flag
   - `google-oauth-exchange` Edge Function stores tokens for Gmail, Calendar, and YouTube in one exchange
   - `ConnectionsTab.tsx` shows live connected status for the unified Google section
3. [DONE] Reduce top padding space to only 15px for the "All-in-One" section in `Landing.tsx`
4. [DONE] Landing/pricing polish pass
   - Seamless logo marquee, 10px space above "תשתית טכנולוגית", copy removals
   - Feature card navy hover + text bump
   - Touch Credits "הסבר" popup (landing + profile packages)
   - FAQ Touch Credits explanation
   - Monthly/annual toggle in profile packages tab
5. [DONE] Landing header: plain navy "הרשמה/התחברות" link instead of filled button
