import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LeftoverDiscountButton from './LeftoverDiscountButton';
const mocks = vi.hoisted(() => ({ eq: vi.fn(), row: null as unknown }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'affiliate-user' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const chain = { select: () => chain, eq: (...args: unknown[]) => { mocks.eq(...args); return chain; }, maybeSingle: () => Promise.resolve({ data: mocks.row }) };
  return chain;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('hides discount editing when the authenticated affiliate does not own the referral', async () => {
  mocks.row = null;
  render(<LeftoverDiscountButton referralId="referral" inline />);
  await vi.waitFor(() => expect(mocks.eq).toHaveBeenCalledWith('affiliate_id', 'affiliate-user'));
  expect(screen.queryByRole('button', { name: 'שמירה' })).toBeNull();
});
it('shows discount editing for the authenticated referral affiliate', async () => {
  mocks.row = { leftover_discount_type: 'percent', leftover_discount_value: 20 };
  render(<LeftoverDiscountButton referralId="referral" inline />);
  expect(await screen.findByRole('button', { name: 'שמירה' })).toBeTruthy();
  expect(screen.getByText(/נקבעת על ידך כשותף/)).toBeTruthy();
});