export const GROUP_POST_TOPICS = [
  { id: 'daily-tip', label: 'קמפיין כללי / טיפ נדל"ן יומי' },
  { id: 'first-home', label: 'טיפים קריטיים לקוני דירה ראשונה' },
  { id: 'renting', label: 'למה לשים לב כששוכרים או משכירים דירה' },
  { id: 'selling-mistakes', label: 'טעויות נפוצות במכירת נכס ואיך להימנע מהן' },
  { id: 'market-trends', label: 'מגמות שוק הנדל"ן הנוכחיות' },
  { id: 'investors', label: 'טיפים למשקיעי נדל"ן' },
] as const;

export function groupPostTopic(id: unknown) {
  return GROUP_POST_TOPICS.find((topic) => topic.id === id) ?? GROUP_POST_TOPICS[0];
}

export function groupPostTopicInstructions(id: unknown) {
  return [
    `נושא הקמפיין לקבוצות: ${groupPostTopic(id).label}. זהו הנושא המחייב גם אם טיוטה קודמת עוסקת בנושא אחר.`,
    'כתוב קמפיין נדל"ן שימושי ומעורר שיח לקבוצות פייסבוק, עם עצות מעשיות ושאלה פתוחה אחת בסיום. אין לקדם נכס מסוים.',
    'אל תמציא מחירים, נתוני שוק, אחוזים, תשואות או מגמות עדכניות. אם אין נתונים מאומתים, התמקד בעקרונות ובדרכים לבדוק את השוק.',
  ].join('\n');
}