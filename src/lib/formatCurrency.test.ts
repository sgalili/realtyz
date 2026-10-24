import { describe, expect, it } from 'vitest';
import { fmtILS } from './formatCurrency';

describe('shekel displays keep their cents', () => {
  it('shows cents instead of rounding the amount down', () => {
    expect(fmtILS(5345.08)).toBe('₪5,345.08');
    expect(fmtILS(5345.5)).toBe('₪5,345.50');
    expect(fmtILS(0.08)).toBe('₪0.08');
  });

  it('keeps whole amounts without trailing cents', () => {
    expect(fmtILS(5345)).toBe('₪5,345');
    expect(fmtILS(2000000)).toBe('₪2,000,000');
  });

  it('honours an explicit fractionDigits request', () => {
    expect(fmtILS(1200, { fractionDigits: 2 })).toBe('₪1,200.00');
  });

  it('keeps the fallback for missing amounts', () => {
    expect(fmtILS(null)).toBe('—');
    expect(fmtILS(undefined, { fallback: 'לא צוין' })).toBe('לא צוין');
  });
});
