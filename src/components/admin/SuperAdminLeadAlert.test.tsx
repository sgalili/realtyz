import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from '@/lib/router-compat';
import { expect, it, vi } from 'vitest';
import { SuperAdminLeadAlert } from './SuperAdminLeadAlert';

const query = vi.hoisted(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockResolvedValue({ count: 3 }),
}));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: true }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => query) } }));
vi.mock('@/lib/safeRealtime', () => ({
  safeChannel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
  removeChannelSafe: vi.fn(),
}));

it('shows the global number of waiting Super Admin notifications', async () => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SuperAdminLeadAlert /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('3')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'סופר אדמין, 3 התראות חדשות' })).toHaveAttribute('href', '/super-admin');
});
