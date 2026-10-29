import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'person' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'office' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => chain }) } }));
const chain = { eq: mocks.eq, in: mocks.in, order: mocks.order, limit: mocks.limit };
mocks.eq.mockImplementation(() => chain); mocks.in.mockImplementation(() => chain); mocks.order.mockImplementation(() => chain);
mocks.limit.mockResolvedValue({ data: [{ id: 'task', title: 'בדיקת המודעה', content: '', scheduled_for: '2026-10-30', status: 'pending' }], error: null });
import PersonalTasks from './PersonalTasks';
it('reads personal tasks inside the authorized workspace, never office tours', async () => {
  render(<QueryClientProvider client={new QueryClient()}><PersonalTasks /></QueryClientProvider>);
  await screen.findByText('בדיקת המודעה');
  expect(mocks.eq).toHaveBeenCalledWith('workspace_owner_id', 'office');
  expect(mocks.eq).toHaveBeenCalledWith('user_id', 'person');
  expect(mocks.in).toHaveBeenCalledWith('item_type', ['task', 'reminder', 'follow_up']);
});