import { act, cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CompleteProfileBanner } from './CompleteProfileBanner';

const state = vi.hoisted(() => ({ profile: { full_name: 'Test User', city: '', phone: '0500000001' } as { full_name: string; city: string; phone: string } | null, reads: [] as string[], error: null as unknown, read: null as null | (() => Promise<unknown>) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'profile-test' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: async () => { state.reads.push(id); return state.read ? state.read() : { data: state.profile, error: state.error }; } }) }) }) } }));
beforeEach(() => { cleanup(); localStorage.clear(); state.profile = { full_name: 'Test User', city: '', phone: '0500000001' }; state.reads = []; state.error = null; state.read = null; });
it('reads saved completion and removes the missing-details notice even with force', async () => {
  const { queryByRole } = render(<CompleteProfileBanner force />);
  await waitFor(() => expect(queryByRole('status')).not.toBeNull());
  state.profile = { full_name: 'Test User', city: 'חיפה', phone: '0500000001' };
  act(() => window.dispatchEvent(new Event('realtyz:profile-saved')));
  await waitFor(() => expect(queryByRole('status')).toBeNull());
});

it('checks the displayed workspace owner, not the signed-in viewer', async () => {
  state.profile = { full_name: 'Broker', city: 'הרצליה', phone: '' };
  const view = render(<CompleteProfileBanner profileOwnerId="broker-owner" />);
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('חסר: טלפון'));
  expect(state.reads).toEqual(['broker-owner']);
  expect(view.getByRole('status')).not.toHaveTextContent('חסר: עיר');
});

it('lists only genuinely empty or whitespace fields', async () => {
  state.profile = { full_name: '  ', city: 'חיפה', phone: '' };
  const view = render(<CompleteProfileBanner />);
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('חסר: שם מלא, טלפון'));
});

it('does not report unavailable records as incomplete', async () => {
  state.profile = null;
  const view = render(<CompleteProfileBanner />);
  await waitFor(() => expect(state.reads).toHaveLength(1));
  expect(view.queryByRole('status')).toBeNull();
});

it('removes a saved field immediately before the refresh resolves', async () => {
  state.profile = { full_name: '', city: '', phone: '0500000001' };
  const view = render(<CompleteProfileBanner profileOwnerId="owner" />);
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('חסר: שם מלא, עיר'));
  state.read = () => new Promise(() => {});
  act(() => window.dispatchEvent(new CustomEvent('realtyz:profile-saved', { detail: { profileOwnerId: 'owner', profile: { full_name: '', city: 'חיפה', phone: '0500000001' } } })));
  expect(view.getByRole('status')).toHaveTextContent('חסר: שם מלא');
  expect(view.getByRole('status')).not.toHaveTextContent('עיר');
});

it('ignores another owner save and hides old warnings during workspace changes', async () => {
  const view = render(<CompleteProfileBanner profileOwnerId="owner" />);
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('חסר: עיר'));
  act(() => window.dispatchEvent(new CustomEvent('realtyz:profile-saved', { detail: { profileOwnerId: 'other', profile: { full_name: 'Other', city: 'חיפה', phone: '0500000001' } } })));
  expect(view.getByRole('status')).toHaveTextContent('חסר: עיר');
  state.read = () => new Promise(() => {});
  view.rerender(<CompleteProfileBanner profileOwnerId="other" />);
  expect(view.queryByRole('status')).toBeNull();
});

it('rejects an older incomplete response after a newer completed save', async () => {
  let resolveOld: (value: unknown) => void = () => {};
  state.read = () => new Promise(resolve => { resolveOld = resolve; });
  const view = render(<CompleteProfileBanner />);
  await waitFor(() => expect(state.reads).toHaveLength(1));
  const stale = resolveOld;
  state.read = null;
  state.profile = { full_name: 'Test User', city: 'חיפה', phone: '0500000001' };
  act(() => window.dispatchEvent(new Event('realtyz:profile-saved')));
  await waitFor(() => expect(state.reads).toHaveLength(2));
  await act(async () => stale({ data: { full_name: 'Test User', city: '', phone: '0500000001' }, error: null }));
  expect(view.queryByRole('status')).toBeNull();
});

it('rechecks persisted fields on window focus', async () => {
  const view = render(<CompleteProfileBanner />);
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('עיר'));
  state.profile = { full_name: 'Test User', city: 'חיפה', phone: '0500000001' };
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(view.queryByRole('status')).toBeNull());
});