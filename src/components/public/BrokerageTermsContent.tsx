/** Short brokerage terms shown only from the publishing flow consent link. */
export default function BrokerageTermsContent() {
  return (
    <article dir="rtl" className="mx-auto max-w-2xl space-y-4 px-2 py-4 text-[15px] leading-relaxed text-foreground">
      <p>TORAFF היא פלטפורמה טכנולוגית לפרסום נכסים ולחיבור בין מפרסמים, שותפים ופונים. TORAFF אינה צד לעסקת המקרקעין ואינה מתווכת בה.</p>
      <ul className="list-disc space-y-2 ps-5">
        <li>תיווך בעסקאות מקרקעין וקבלת דמי תיווך מותרים רק לבעלי רישיון תיווך ישראלי בתוקף, בהתאם לחוק המתווכים במקרקעין, התשנ״ו-1996.</li>
        <li>עמלת סגירת עסקה מוצעת ומשולמת רק למתווכים שרישיונם אומת במערכת. מי שאינו מתווך מורשה אינו זכאי לדמי תיווך.</li>
        <li>תשלום עבור פניות (טופס, ווטסאפ או שיחה) הוא תשלום על שירות שיווקי ואינו דמי תיווך.</li>
        <li>המפרסם אחראי לנכונות פרטי הנכס, לזכותו לשווק אותו ולעמידה בכל דין, לרבות הסכם בכתב עם הלקוח כשנדרש.</li>
        <li>TORAFF אינה אחראית לתוצאות העסקה, למחלוקות בין הצדדים או לנזק הנובע מהסתמכות על פרטי המודעה.</li>
      </ul>
      <p className="text-sm text-muted-foreground">הפירוט המלא מופיע בתקנון האתר, והוא הגובר בכל מקרה של סתירה.</p>
    </article>
  );
}
