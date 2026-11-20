import { beforeEach, describe, expect, it } from 'vitest';
import { adminHistoryFromParams, adminSectionFromParams, readSuperAdminViewState, saveSuperAdminViewState } from './superAdminViewState';

describe('Super Admin view restoration', () => {
  beforeEach(() => sessionStorage.clear());

  it('defaults to pending invitations and restores an explicit pending selection', () => {
    expect(adminHistoryFromParams(null)).toBe('pending');
    saveSuperAdminViewState({ section: 'import', history: 'pending' });
    expect(adminHistoryFromParams(null)).toBe('pending');
  });

  it('restores the last section and history tab when URL parameters are absent', () => {
    saveSuperAdminViewState({ section: 'import', history: 'sends' });
    expect(adminSectionFromParams(null)).toBe('import');
    expect(adminHistoryFromParams(null)).toBe('sends');
  });

  it('restores the exact open send card without losing the section', () => {
    saveSuperAdminViewState({ section: 'import', history: 'sends' });
    saveSuperAdminViewState({ openSendKey: 'developer-1:email:2026-11-17T00:00:00Z' });
    expect(readSuperAdminViewState()).toEqual({ section: 'import', history: 'sends', openSendKey: 'developer-1:email:2026-11-17T00:00:00Z' });
  });

  it('prefers explicit URL navigation over the saved state', () => {
    saveSuperAdminViewState({ section: 'import', history: 'sends' });
    expect(adminSectionFromParams('users')).toBe('users');
    expect(adminHistoryFromParams('imports')).toBe('imports');
  });
});
