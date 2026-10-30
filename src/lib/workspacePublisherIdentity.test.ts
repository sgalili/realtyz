import { expect, it } from 'vitest';
import { workspacePublisherIdentity } from './workspacePublisherIdentity';
it('never accepts administrator identity for a partner workspace', () => {
  expect(workspacePublisherIdentity('partner', 'admin', { full_name: 'Admin', phone: '972501234567' })).toEqual({ name: '', phone: '', email: '' });
});
it('returns only the active owner identity', () => {
  expect(workspacePublisherIdentity('partner', 'partner', { full_name: 'Partner', phone: '972509876543' })).toEqual({ name: 'Partner', phone: '972509876543', email: '' });
});
it('leaves missing owner facts empty rather than borrowing account details', () => {
  expect(workspacePublisherIdentity('partner', 'partner', null)).toEqual({ name: '', phone: '', email: '' });
});