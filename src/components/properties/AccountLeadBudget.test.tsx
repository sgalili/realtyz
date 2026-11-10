import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountLeadBudget } from './AccountLeadBudget';
const mocks = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
describe('account budget reads', () => {
  it('blocks overwriting unknown limits after a failed read and allows retry', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.read };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    mocks.read.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } }).mockResolvedValueOnce({ data: { daily_count: 3, daily_spend_ils: 100 }, error: null });
    render(<AccountLeadBudget ownerId="workspace-1" />);
    await screen.findByRole('button', { name: 'ניסיון טעינה נוסף' });
    expect(screen.getByRole('button', { name: 'שמירת מגבלות' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון טעינה נוסף' }));
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: 'מקסימום פניות יומי לחשבון' })).toHaveValue(3));
    expect(screen.getByRole('spinbutton', { name: 'מקסימום הוצאה יומית לחשבון' })).toHaveValue(100);
    expect(screen.getByRole('button', { name: 'שמירת מגבלות' })).not.toBeDisabled();
  });
});