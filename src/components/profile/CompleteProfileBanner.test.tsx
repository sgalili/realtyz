import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CompleteProfileBanner } from './CompleteProfileBanner';

const state = vi.hoisted(() => ({ profile: { full_name: 'Test User', city: '', phone: '0500000001' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'profile-test' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }) } }));
beforeEach(() => { localStorage.clear(); state.profile.city = ''; });
it('reads saved completion and removes the missing-details notice even with force', async () => {
  const { queryByRole } = render(<CompleteProfileBanner force />);
  await waitFor(() => expect(queryByRole('status')).not.toBeNull());
  state.profile.city = 'חיפה';
  act(() => window.dispatchEvent(new Event('realtyz:profile-saved')));
  await waitFor(() => expect(queryByRole('status')).toBeNull());
});