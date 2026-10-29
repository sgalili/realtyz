import { describe, expect, it } from 'vitest';
import { tagShareText, withShareUtm } from './shareTracking';

describe('share link tagging', () => {
  it('tags WhatsApp shares', () => {
    expect(withShareUtm('https://toraff.co.il/p/abc', 'whatsapp')).toBe('https://toraff.co.il/p/abc?utm_source=whatsapp&utm_medium=social');
  });
  it('tags Facebook shares', () => {
    expect(withShareUtm('https://toraff.co.il/r/x1', 'facebook')).toBe('https://toraff.co.il/r/x1?utm_source=facebook&utm_medium=social');
  });
  it('tags email shares and keeps existing params', () => {
    expect(withShareUtm('https://toraff.co.il/p/abc?ref=K9', 'email')).toBe('https://toraff.co.il/p/abc?ref=K9&utm_source=email&utm_medium=email');
  });
  it('tags copied links', () => {
    expect(withShareUtm('https://toraff.co.il/auth?invite=Z', 'copy')).toBe('https://toraff.co.il/auth?invite=Z&utm_source=copy_link&utm_medium=share');
  });
  it('never tags external links', () => {
    expect(withShareUtm('https://wa.me/972500000000', 'whatsapp')).toBe('https://wa.me/972500000000');
  });
  it('tags links inside message text', () => {
    expect(tagShareText('ראו: https://toraff.co.il/p/a\nתודה', 'whatsapp')).toBe('ראו: https://toraff.co.il/p/a?utm_source=whatsapp&utm_medium=social\nתודה');
  });
});
