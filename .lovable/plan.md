# Plan: סיור מוצר פר-דף לנרשמים חדשים

## Goal
בנוסף לסיור ההיכרות הראשוני, הרחבה למערכת סיור דינאמית שמופעלת בפעם הראשונה שמשתמש חדש נכנס לכל דף באפליקציה, עם כפתור עזרה "?" קבוע ליד כותרת העמוד (בגלי העמוד) כל עוד הוא בניסיון/לא משלם.

## What will be built
1. **Route-based tour definitions** — `src/lib/pageTours.ts` יגדיר עבור כל נתיב רשימת צעדי סיור (popovers על selectors, הסברים, טיפסטים) ומסך פתיחה (splash) ייעודי.
2. **Persistent per-page visited state** — השלמת סיור עמוד תישמר בטבלת `onboarding_progress` בעמודה `metadata.page_tours` (מפתחות לפי path). אם משתמש דילג, סימון כ"נצפה" כדי לא לטעון שוב.
3. **PageTour engine** — קומפוננטה `src/components/tour/PageTour.tsx` שמפעילה את הסיור: מציגה splash screen → מדגישה רכיבים ב-DOM בעזרת selectors/CSS highlight → כפתורי הבא/הקודם/דלג.
4. **PageTourHelpButton** — כפתור "?" קטן ליד כותרת העמוד (בתוך `PageHero` או בסרגל הכותרת של כל דף). נראה רק למשתמשים בניסיון/ללא מנוי פעיל.
5. **AppLayout integration** — האזנה לשינוי route ב`useLocation`; אם מדובר בנרשם חדש (created_at < 24h או `onboarding_progress` ראשוני) והעמוד לא נצפה → פותח splash screen אוטומטית.
6. **Initial page coverage** — סיורים ראשוניים לדפים העיקריים: `/dashboard`, `/properties`, `/leads`, `/campaigns`, `/command-center`, `/live-conversations`, `/insights`.
7. **Trial detection** — שימוש ב`useTrialStatus` / `user_subscriptions` כדי להסתיר את כפתור ה"?" ולהפסיק סיורים אוטומטיים אחרי מעבר לתשלום.

## Technical details
- לא מוסיפים ספרייה חיצונית (driver.js) — נשתמש במנגנון highlight פנימי עם overlay + absolute highlight box, דומה לסיור הקיים.
- צעדי הסיור ישתמשו ב-`data-tour-id` / `data-tour-step` וב-selectors יציבים (aria-label, roles, classes) שנבדקים בכל דף.
- Splash screen יהיה `Dialog` עם תוכן מותאם לכל דף (מה הסיפור של הדף, מה אפשר לעשות בו).
- התמיכה ב-RTL ובמובייל: highlight box יחושב ביחס לעיגון ימני/שמאלי, והחיצים יתאימו.

## Files to change
- `src/components/tour/ProductTour.tsx` — שמירת סיום הסיור הראשוני כ-flag נפרד, מניעת כפילות.
- `src/components/tour/PageTour.tsx` — קומפוננטת סיור פר-דף חדשה.
- `src/lib/pageTours.ts` — הגדרות צעדים ו-splashes.
- `src/components/PageHero.tsx` — הוספת כפתור "?" ליד הכותרת.
- `src/components/AppLayout.tsx` — הפעלה אוטומטית לפי route.
- `src/hooks/useTrialStatus.ts` — ודא שמחזיר מצב trial נוכחי (אם קיים).

## Validation
- פתיחת כל דף בעזרת Playwright, וידוא שה-splash לא חוזר אחרי סיום הסיור.
- בדיקת כפתור "?" שמופיע רק למשתמש ב-trial ומפעיל מחדש את הסיור.
