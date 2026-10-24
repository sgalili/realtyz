import { describe, expect, it } from 'vitest';
import { enableLeadPrice } from './enableLeadPrice';

describe('lead title activation', () => {
  it('enables each disabled tier at its configured minimum', () => {
    expect(enableLeadPrice('', 'form')).toBe('40');
    expect(enableLeadPrice('', 'whatsapp')).toBe('50');
    expect(enableLeadPrice('', 'phone')).toBe('80');
  });
  it('retains the selected price when reopening settings', () => {
    expect(enableLeadPrice('125', 'phone')).toBe('125');
  });
});