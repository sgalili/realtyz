import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, DEFAULT_ADMIN_SECTION, adminSectionLabel, resolveAdminSection } from './superAdminSections';

describe('super admin hero dropdown', () => {
  it('opens on user management', () => {
    expect(DEFAULT_ADMIN_SECTION).toBe('users');
    expect(adminSectionLabel(DEFAULT_ADMIN_SECTION)).toBe('ניהול משתמשים');
  });

  it('offers every requested section', () => {
    const labels = ADMIN_SECTIONS.map((section) => section.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'ניהול משתמשים',
        'ייבוא מתווכים',
        'חיבורים',
        'פיננסי',
        'פעילות וניטור',
        'שגיאות ומערכת',
      ]),
    );
  });

  it('keeps one selectable entry per section', () => {
    const values = ADMIN_SECTIONS.map((section) => section.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => value.length > 0)).toBe(true);
    expect(ADMIN_SECTIONS.every((section) => section.icon !== undefined)).toBe(true);
  });

  it('counts open connection alerts only on the connections entry', () => {
    expect(adminSectionLabel('connections', 3)).toBe('חיבורים (3)');
    expect(adminSectionLabel('connections', 0)).toBe('חיבורים');
    expect(adminSectionLabel('finance', 3)).toBe('פיננסי');
  });

  it('falls back to user management for unknown section values', () => {
    expect(resolveAdminSection('connections')).toBe('connections');
    expect(resolveAdminSection(null)).toBe('users');
    expect(resolveAdminSection('bogus')).toBe('users');
  });
});
