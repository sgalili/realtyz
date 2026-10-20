export function closingFeeRange(dealType: string | null | undefined, propertyPrice: number) {
  const rent = dealType === 'rent';
  return { min: rent ? 10 : 0.2, max: rent ? 100 : 2, step: rent ? 1 : 0.01, price: Math.max(0, Number(propertyPrice) || 0), rent };
}

export function clampClosingPercent(value: number, dealType: string | null | undefined) {
  const { min, max } = closingFeeRange(dealType, 0);
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function closingFeeAmount(percent: number, price: number) {
  return Math.round(price * percent / 100);
}

export type LeadDailyLimits = { form?: number | null; whatsapp?: number | null; phone?: number | null };
export function activeLeadLimits(amounts: number[], limits: LeadDailyLimits): LeadDailyLimits {
  return Object.fromEntries((['form', 'whatsapp', 'phone'] as const).map((key, index) => [key,
    amounts[index] > 0 && Number.isInteger(limits[key]) && Number(limits[key]) > 0 ? limits[key] : null,
  ]));
}