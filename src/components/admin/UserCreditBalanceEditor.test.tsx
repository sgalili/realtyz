import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserCreditBalanceEditor, validCreditBalance } from './UserCreditBalanceEditor';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
describe('Super Admin exact credit editor', () => {
  beforeEach(() => rpc.mockReset());
  it('accepts zero and fractional credits but rejects negative and nonfinite inputs', () => {
    expect(validCreditBalance('0')).toBe(true);
    expect(validCreditBalance('100.25')).toBe(true);
    for (const value of ['-1', '', 'NaN', 'Infinity', '1.234']) expect(validCreditBalance(value)).toBe(false);
  });
  it('sets the selected user exact credits, never an unscoped increment or ILS value', async () => {
    rpc.mockResolvedValue({ data: 100.25, error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    render(<QueryClientProvider client={qc}><UserCreditBalanceEditor userId="target-user" name="לקוח" balance={{ balance_ils: 25, balance_credits: 100 }} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת יתרת קרדיטים עבור לקוח' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'יתרת קרדיטים עבור לקוח' }), { target: { value: '100.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמירת יתרה עבור לקוח' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('super_admin_set_credit_balance', { _user_id: 'target-user', _credits: 100.25, _expected_balance_ils: 25 }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-wallet'] }));
  });
});