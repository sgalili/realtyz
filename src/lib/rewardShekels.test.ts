import { expect, it } from 'vitest';
import { formatReward } from '@/hooks/useAffiliate';
it('converts a one-percent closing reward on three million to 24000 net shekels', () => {
  expect(formatReward('percent', 1, 3000000)).toBe('₪24,000 לשותף');
});
it('never relabels a percentage as shekels without a price basis', () => {
  expect(formatReward('percent', 1)).toBe('מחיר לא זמין');
});
it('keeps fixed closing rewards on the same net shekel calculation', () => {
  expect(formatReward('fixed', 30000)).toBe('₪24,000 לשותף');
});