import { describe, it, expect } from 'vitest';
import { importedLicenseDaysLabel } from './importedLicenseState';
describe('imported license countdown', () => {
  it('counts remaining days', () => { expect(importedLicenseDaysLabel(14)).toContain('14'); });
  it('marks the last day', () => { expect(importedLicenseDaysLabel(0)).toContain('האחרון'); });
});
