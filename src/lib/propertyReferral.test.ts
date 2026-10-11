import { describe, expect, it } from 'vitest';
import { propertyInquiryRef } from './propertyReferral';

describe('property inquiry attribution', () => {
  it('preserves the exact code case', () => expect(propertyInquiryRef('?ref=abc123XYZ')).toBe('abc123XYZ'));
  it('rejects wildcard and malformed codes', () => {
    expect(propertyInquiryRef('?ref=abc%25def')).toBeNull();
    expect(propertyInquiryRef('?ref=abc_def')).toBeNull();
    expect(propertyInquiryRef('')).toBeNull();
  });
});