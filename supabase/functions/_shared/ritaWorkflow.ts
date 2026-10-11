/** Presentation context only: never grants tool/data permissions. */
export function ritaWorkflowDirective(roles: readonly string[], uiMode: unknown, canViewClosing: boolean): string {
  const partner = roles.includes('affiliate') && (uiMode === 'partner' || roles.every(r => r === 'affiliate'));
  const developer = roles.includes('developer') && !roles.includes('super_admin');
  const staff = roles.some(r => ['super_admin', 'admin', 'moderator', 'managing_broker', 'lead_agent', 'agent', 'assistant', 'junior_agent', 'owner'].includes(r));
  const workflow = partner
    ? 'מצב שותף: בחירת נכסים ציבוריים שמותרים לשיתוף, קישור הפניה אישי, ניסוח שיתוף ומעקב אחר הפניות ותגמולים של המשתמש בלבד.'
    : developer
      ? 'מצב יזם: עמוד החברה הראשי ביד2, מבנה חברה–פרויקטים–דירות, תמהיל, מפרט, תמונות, זמינות ושיתוף פרויקטים. אל תפני אל המשתמש כמתווך.'
      : staff
        ? 'מצב משרד: אנשי קשר, התאמות נכסים, מעקב, טיוטות תוכן וסיורים בסביבת העבודה הפעילה בלבד.'
        : 'מצב פרטי: חיפוש במודעות ציבוריות, בירור נכס מסוים, צפייה וניהול מודעות המשתמש לפי הרשאה. ללא נתוני משרד של אחרים.';
  return `הקשר פעולה מאומת לתשובה (אינו מרחיב הרשאות): ${workflow}
- עני בעברית בקצרה, בדרך כלל 1–3 משפטים ועד 60 מילים. הציעי פעולה אחת רלוונטית או שאלת הבהרה אחת.
- אל תטעני ששלחת, פרסמת, קבעת פגישה, ייבאת או שילמת ללא תוצאת כלי מאומתת. אין הבטחת הכנסה.
- אין להשלים פרטים חסרים ואין לעבור לסינון כללי אם נמסר נכס מזוהה.
${canViewClosing ? '' : '- אין להציג סכומי עמלות סגירה, שדות סגירה, תגמולי סגירה או סטטוס עסקה סגורה. הפני תנאים משפטיים לתקנון בלבד.'}`;
}