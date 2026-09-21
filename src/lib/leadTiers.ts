// Lead tiers for partner marketing.
//
// A tier is ACTIVE purely because the publisher typed a price into it — there
// are no manual toggles. The contact methods shown on the public property page
// are derived from those prices:
//
//   Level 1 (mandatory)  digital lead  — name + phone form
//   Level 2 (optional)   WhatsApp chat with Rita (hides the name/phone form)
//   Level 3 (optional)   phone conversation
//   Level 4 (optional)   deal closing — licensed real-estate agents only

/** Extra screening questions beyond the first three cost this much each. */
export const EXTRA_QUESTION_COST = 10;

export type LeadContactOptions = {
  digital?: boolean;
  whatsapp?: boolean;
  phone?: boolean;
  questions?: string[];
  questions_phone?: string[];
};

export function defaultQuestions(dealType: string | null | undefined): string[] {
  return dealType === 'rent'
    ? ['מתי תרצו להיכנס לנכס?', 'מה התקציב החודשי שלכם?', 'כמה נפשות יגורו בנכס?']
    : ['מה התקציב שלכם לרכישה?', 'האם יש לכם אישור עקרוני למשכנתה?', 'מתי תרצו להיכנס לנכס?'];
}

/** How much a lead of this tier costs the publisher, questions included. */
export function leadCost(base: number, questions: string[]): number {
  const extra = Math.max(questions.filter((q) => q.trim()).length - 3, 0);
  return (Number(base) || 0) + extra * EXTRA_QUESTION_COST;
}

/**
 * Contact methods the public property page should show, derived from prices.
 * Level 2 replaces the name/phone form with the Rita WhatsApp button.
 */
export function deriveContactOptions(input: {
  tier1: number;
  tier2: number;
  tier3: number;
  questions: string[];
  questionsPhone: string[];
}): LeadContactOptions {
  const hasTier2 = input.tier2 > 0;
  return {
    digital: input.tier1 > 0 && !hasTier2,
    whatsapp: hasTier2,
    phone: input.tier3 > 0,
    questions: input.questions.filter((q) => q.trim()),
    questions_phone: input.questionsPhone.filter((q) => q.trim()),
  };
}
