import { describe, expect, it } from 'vitest';
import { leadPriceLabel } from './leadPriceLabel';

describe('collapsed lead price label', () => {
  it('shows the configured per-lead price', () => {
    expect(leadPriceLabel('125')).toBe('₪125');
    expect(leadPriceLabel(50)).toBe('₪50');
  });
  it('falls back to ללא עמלה when no price is set', () => {
    expect(leadPriceLabel('')).toBe('ללא עמלה');
    expect(leadPriceLabel(null)).toBe('ללא עמלה');
    expect(leadPriceLabel(0)).toBe('ללא עמלה');
  });
});
