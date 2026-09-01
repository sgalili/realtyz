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
6. [DONE] Affiliate network foundation (marketplace, broker rewards, RBAC portal)
7. [DONE] CRM master import (RealTies_AI_CRM_Master_Udi_Vitman_1.json) — UPSERT/MERGE, backup + report
8. [TODO] Google OAuth: friendly Hebrew handling for "API disabled" errors + minimize requested scopes

- [DONE] תיקון טאב "עתידיים" בעמוד פוסטים: לא מציג את כל הפוסטים המתוזמנים (מופיע ריק)
- [DONE] ביקורת מערכת מקיפה: תור אוטופילוט מחובר (טריגר מיידי + גיבוי שעתי), פונקציית drip חדשה (2 שעות / 3 ימים) עם חלון 09:00-21:00 ותקרות בטיחות

- [DONE] פוסטים: גרירת תמונות בקומפוזר + תמונה ראשית מוגדלת, מחיקה מרובה של טיוטות, הסרת בחירת קבוצות מדיאלוג העריכה, שמירת קבוצות ותזמון מדויק, ספירה לאחור עם שניות
- [DONE] עיצוב מחדש של מסך רשת השותפים (/referral) — 3 שלבים, מדרגות תגמול, 4 מדדים, כפתורי העתקה/שיתוף

## Sep 1 — new tasks
- [ ] Affiliate marketplace & 3-tier commissions (portal /affiliates, tier setup, lead submissions) — in progress
- [ ] Fix first auto-comment execution: capture post_id from Graph API and immediately POST /{post_id}/comments
- [ ] Fix textarea cursor jumping in post composer/editor (stable local state / uncontrolled + debounce)

## Sep 1 (evening)
- [x] Background STT for inbound WhatsApp voice notes → transcript stored as inbound text + AI autopilot reply
- [x] Fix AI agent CRM schema mapping: contacts→leads, phone→phone_number (prompt + runtime SQL guard)

## Sep 1 (late) — AI agent hardening
- [x] Safe error handling: all AI tool/SQL failures logged internally (_shared/safeToolError.ts) and answered with a graceful Hebrew fallback; no raw errors in chat/WhatsApp
- [x] Persona cleanup: banned internal jargon/meta-commentary ("קצין המודיעין" etc.), silent tool execution + natural Hebrew lead-in before results
