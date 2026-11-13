import { describe, expect, it } from 'vitest';
import { applyBulkPublicationPricing } from './bulkPublicationPricing';
import { brokerOnlyPricing } from './publicationSettings';

describe('selected asset pricing', () => {
  it('applies prices to selected assets only, retaining individual overrides and other settings', () => {
    const drafts = { a: { t1: '40', t4: '1', unit: 'percent' as const, questions: ['תקציב?'] }, b: { t1: '80', t4: '2', unit: 'percent' as const, questions: [] }, c: { t1: '20', t4: '1', unit: 'percent' as const, questions: [] } };
    const result = applyBulkPublicationPricing(drafts, ['a', 'b'], new Set(['b']), { t1: '60', t4: '1.5' });
    expect(result.a).toEqual({ t1: '60', t4: '1.5', unit: 'percent', questions: ['תקציב?'] });
    expect(result.b).toEqual(drafts.b);
    expect(result.c).toEqual(drafts.c);
  });
  it('empty and zero lead prices qualify for broker-only publication, any positive price does not', () => {
    expect(brokerOnlyPricing(['', '0', null])).toBe(true);
    expect(brokerOnlyPricing(['', '60', '0'])).toBe(false);
  });
});