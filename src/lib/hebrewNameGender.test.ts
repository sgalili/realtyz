import { expect, it } from 'vitest';
import { classifyHebrewName } from './hebrewNameGender';
it('classifies clear names', () => { expect(classifyHebrewName('משה כהן').gender).toBe('male'); expect(classifyHebrewName('עו״ד יעל לוי').gender).toBe('female'); });
it('keeps unisex names unknown', () => { for (const n of ['עדי','נועם','אור','טל','אביב','אריאל','דניאל','שחר','ים','גלי','אופיר']) expect(classifyHebrewName(`${n} לוי`).gender).toBe('unknown'); });
