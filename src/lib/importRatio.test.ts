import { expect, test } from 'vitest';
import { hasMoreOnYad2, importRatioLabel } from './importRatio';
test('shows imported over total', () => expect(importRatioLabel(4, 12)).toBe('(4/12)'));
test('missing total falls back without NaN', () => { expect(importRatioLabel(4, null)).toBe('(4)'); expect(importRatioLabel(undefined, undefined)).toBe('(0)'); });
test('add button only when Yad2 has more', () => { expect(hasMoreOnYad2(4, 12)).toBe(true); expect(hasMoreOnYad2(12, 12)).toBe(false); expect(hasMoreOnYad2(4, null)).toBe(false); });
