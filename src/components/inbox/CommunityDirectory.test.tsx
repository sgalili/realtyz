// In the "שיחה חדשה" directory a person's name must never start a chat by itself:
// the name/avatar row opens their public profile, and the chat opens only from the
// explicit "שיחה" action, so users can check who they are messaging first.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CommunityDirectory } from './CommunityDirectory';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'dir-user' } }) }));

const rpc = vi.hoisted(() => vi.fn(async (fn: string) => {
  if (fn === 'community_directory') return { data: [{ id: 'peer-1', full_name: 'דנה כהן', avatar_url: null, category: 'broker' }], error: null };
  if (fn === 'community_profile_cards') return { data: [{ id: 'peer-1', full_name: 'דנה כהן', category: 'broker', office_name: 'משרד הדס', license_number: '123456789' }], error: null };
  if (fn === 'community_profile_listings') return { data: [], error: null };
  return { data: null, error: new Error(`unexpected rpc ${fn}`) };
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/inbox']}><Routes><Route path="/inbox" element={children} /><Route path="/community/profile/:userId" element={<p>profile page peer-1</p>} /></Routes></MemoryRouter></QueryClientProvider>
);

afterEach(cleanup);

it('opens the dedicated public profile page from the contact name without starting a chat', async () => {
  const onSelect = vi.fn();
  render(<CommunityDirectory enabled onSelect={onSelect} />, { wrapper });
  const name = await screen.findByRole('button', { name: 'פתיחת הפרופיל הציבורי של דנה כהן' });
  fireEvent.click(name);
  expect(onSelect).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText('profile page peer-1')).toBeInTheDocument());
});

it('starts the chat only from the explicit chat action', async () => {
  const onSelect = vi.fn();
  render(<CommunityDirectory enabled onSelect={onSelect} />, { wrapper });
  fireEvent.click(await screen.findByRole('button', { name: 'פתיחת שיחה עם דנה כהן' }));
  expect(onSelect).toHaveBeenCalledWith({ id: 'peer-1', full_name: 'דנה כהן', avatar_url: null, category: 'broker' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
