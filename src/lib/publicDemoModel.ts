import type { PublicCard } from '@/pages/PublicListingsBoard';

export const DEMO_POST_LIMIT = 5;
export type DemoProperty = { id: string; city: string; street: string; rooms: number; sqm: number; price: number; rent: boolean; photo?: string; fromBoard: boolean; rewards: number[] };
const sampleCities = ['רמת גן', 'הרצליה', 'רעננה', 'חולון', 'בת ים'];

/** Public facts only: never carry original IDs, addresses, identities, contacts or financial rewards. */
export function demoProperties(rows: readonly PublicCard[]): DemoProperty[] {
  return Array.from({ length: DEMO_POST_LIMIT }, (_, i) => {
    const row = rows[i];
    const rent = row ? row.deal_type === 'rent' : i === 2;
    const price = row?.price && row.price > 0 ? Math.round(row.price * .97 / (rent ? 100 : 10000)) * (rent ? 100 : 10000) : rent ? 7200 : 2450000 + i * 180000;
    return { id: `demo-property-${i + 1}`, city: row?.city || sampleCities[i], street: `רחוב הגנים ${12 + i * 3}`, rooms: row?.rooms || 4, sqm: row?.sqm || 105 + i * 8, price, rent,
      photo: row?.photos?.[0], fromBoard: !!row,
      rewards: [25 + i * 5, 60 + i * 10, 120 + i * 15, Math.round((rent ? price * .2 : price * .005) * .8)] };
  });
}

export function demoPost(property: DemoProperty, index: number) {
  const opening = ['חדש בשכונה', 'מחפשים בית עם מרחב אמיתי?', 'הדירה הבאה שלכם מחכה', 'נכס שכדאי להכיר', 'בית חדש, התחלה חדשה'][index];
  return `${opening} 🏡\n${property.rooms} חדרים ${property.rent ? 'להשכרה' : 'למכירה'} ב${property.city}, ${property.sqm} מ״ר, עם חלל אירוח מואר ומטבח פתוח.\n${property.street} · ${property.rent ? '₪' + property.price.toLocaleString('he-IL') + ' לחודש' : '₪' + property.price.toLocaleString('he-IL')}\n\nמחפשים נכס באזור? כתבו לנו מה התקציב ומה חשוב לכם, וריטה תבדוק התאמה ותעזור לתאם ביקור.\n\nשותפים לשיווק: תגמול לפנייה בטופס ₪${property.rewards[0]}, לשיחת WhatsApp מסוננת ₪${property.rewards[1]}, לשיחה מסוננת ₪${property.rewards[2]}, ולסגירה ₪${property.rewards[3].toLocaleString('he-IL')}.\n#נדלן #${property.city.replace(/\s/g, '')} #TORAFF`;
}

export function simulatedMetrics(index: number, tick: number) {
  const bounded = Math.max(0, Math.floor(tick));
  return { likes: 34 + index * 11 + Math.floor(bounded / 2), shares: 5 + index * 2 + Math.floor(bounded / 6), comments: 2 + Math.min(1, Math.floor(bounded / 4)), views: 620 + index * 173 + bounded * (index + 2) };
}

export const DEMO_COMMENTS = [
  { name: 'נועה ל.', text: 'יש חניה בבניין? נשמח לעוד פרטים.', reply: 'היי נועה, אבדוק את פרטי החניה ואשלח לך תשובה. כמה חדרים אתם מחפשים?' },
  { name: 'איתי מ.', text: 'אפשר לתאם ביקור בשעות אחר הצהריים?', reply: 'בשמחה. איזה יום מתאים, ומה טווח התקציב שלך?' },
  { name: 'מיכל ש.', text: 'מחפשים לעבור לאזור בחודשים הקרובים. זה יכול להתאים.', reply: 'מעולה, מיכל. מה מספר החדרים וטווח התקציב שמתאימים לכם?' },
];