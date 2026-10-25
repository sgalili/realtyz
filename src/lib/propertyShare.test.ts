import { describe, expect, it } from 'vitest';
import { personalizeShareParam } from './propertyShare';

describe('personalizeShareParam', () => {
  const ctx = { name: 'דנה כהן', property: 'הרצל 10, תל אביב', link: 'https://toraff.co.il/share/property/abc', message: 'שלום דנה 👋' };

  it('fills the recipient name token', () => {
    expect(personalizeShareParam('שלום [שם_פרטי]!', ctx)).toBe('שלום דנה כהן!');
    expect(personalizeShareParam('היי [שם],', ctx)).toBe('היי דנה כהן,');
  });

  it('fills the property and link tokens', () => {
    expect(personalizeShareParam('[נכס] · [קישור]', ctx)).toBe('הרצל 10, תל אביב · https://toraff.co.il/share/property/abc');
  });

  it('leaves plain text untouched and blanks unknown recipients', () => {
    expect(personalizeShareParam('הודעה קבועה', ctx)).toBe('הודעה קבועה');
    expect(personalizeShareParam('שלום [שם_פרטי]', { name: null })).toBe('שלום ');
  });
});
