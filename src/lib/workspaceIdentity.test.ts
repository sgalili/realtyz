import { describe, expect, it } from 'vitest';
import { resolveWorkspaceCardIdentity, resolveWorkspaceIdentity } from './workspaceIdentity';
import type { Workspace } from '@/hooks/useWorkspace';

describe('workspace identity privacy', () => {
  it('never surfaces an internal login alias cached as office branding', () => {
    const workspace = { is_self: true, workspace_name: 'p972537759408@phone.toraff.invalid' } as Workspace;
    expect(resolveWorkspaceIdentity(workspace, { agency_name: 'p972537759408@phone.toraff.invalid' }).name).toBe('TORAFF');
  });
});

describe('workspace account card identity', () => {
  const person = {
    workspace_owner_id: 'c202de0e-0000-4000-8000-000000000001',
    user_id: 'c202de0e-0000-4000-8000-000000000001',
    role: 'super_admin',
    // The raw workspace row for a solo person is often just their phone number.
    workspace_name: '053-7759408',
    workspace_logo_url: null,
    account_type: null,
    last_accessed_at: null,
    owner_full_name: 'שפי ישראלי',
    owner_email: 'p972537759408@phone.toraff.invalid',
    owner_avatar_url: null,
    owner_phone: '972537759408',
    is_office: false,
    is_self: false,
  } as Workspace;

  it('names a solo person first and puts the mobile on the line below', () => {
    const card = resolveWorkspaceCardIdentity(person, null, null);
    expect(card.title).toBe('שפי ישראלי');
    expect(card.subtitle).toBe('053-7759408');
    expect(card.isOffice).toBe(false);
  });

  it('keeps a real office or company name on the first line', () => {
    const office = {
      ...person,
      workspace_name: 'אנגלו סכסון הרצליה',
      owner_full_name: 'אודי ויטמן',
      owner_phone: '972522973500',
      is_office: true,
    } as Workspace;
    const card = resolveWorkspaceCardIdentity(office, { agency_name: 'אנגלו סכסון הרצליה' }, null);
    expect(card.title).toBe('אנגלו סכסון הרצליה');
    expect(card.subtitle).toBe('אודי ויטמן');
    expect(card.isOffice).toBe(true);
  });

  it('treats a stale cached row carrying a brand name as an office', () => {
    const stale = { ...person, is_office: undefined } as Workspace;
    const card = resolveWorkspaceCardIdentity(stale, { agency_name: 'ברק תיווך נדלן' }, null);
    expect(card.title).toBe('ברק תיווך נדלן');
  });

  it('falls back to a real email and never prints a synthetic login alias', () => {
    const noPhone = { ...person, owner_phone: null } as Workspace;
    expect(resolveWorkspaceCardIdentity(noPhone, null, null).subtitle).toBe('');
    const realMail = { ...noPhone, owner_email: 'shay@toraff.co.il' } as Workspace;
    expect(resolveWorkspaceCardIdentity(realMail, null, null).subtitle).toBe('shay@toraff.co.il');
  });

  it('never shows an undefined mobile as a dash', () => {
    const noPhone = { ...person, owner_phone: undefined } as Workspace;
    expect(resolveWorkspaceCardIdentity(noPhone, null, null).subtitle).not.toBe('-');
  });
});