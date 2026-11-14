export const DEVELOPER_PLAN_CODE = 'developer_monthly' as const;
export const DEVELOPER_PLAN_TITLE = 'מנוי יזמים TORAFF';
export const DEVELOPER_PLAN_BASE_ILS = 9500;
export const DEVELOPER_PLAN_REGULAR_ILS = 13000;
export const DEVELOPER_PLAN_VAT_RATE = 0.18;
export const DEVELOPER_PLAN_DURATION_DAYS = 30;
export const DEVELOPER_PLAN_BENEFITS = 'פרסום ללא הגבלה של פרויקטים ונכסים, כל הוצאות ה-AI כלולות וגישה לרשת השותפים המקצועית. קמפיינים חיצוניים יכולים לחייב קרדיטים נוספים לפי בחירת המשתמש.';

export function developerPlanQuote() {
  const vatAmountIls = Math.round(DEVELOPER_PLAN_BASE_ILS * DEVELOPER_PLAN_VAT_RATE);
  return {
    planCode: DEVELOPER_PLAN_CODE,
    title: DEVELOPER_PLAN_TITLE,
    benefits: DEVELOPER_PLAN_BENEFITS,
    baseAmountIls: DEVELOPER_PLAN_BASE_ILS,
    regularAmountIls: DEVELOPER_PLAN_REGULAR_ILS,
    vatRate: DEVELOPER_PLAN_VAT_RATE,
    vatAmountIls,
    totalAmountIls: DEVELOPER_PLAN_BASE_ILS + vatAmountIls,
    durationDays: DEVELOPER_PLAN_DURATION_DAYS,
  };
}

export function developerEntitlementActive(entitlement: { plan_code?: string | null; starts_at: string; expires_at: string }, now = new Date()) {
  const time = now.getTime();
  return entitlement.plan_code === DEVELOPER_PLAN_CODE && new Date(entitlement.starts_at).getTime() <= time && new Date(entitlement.expires_at).getTime() > time;
}
