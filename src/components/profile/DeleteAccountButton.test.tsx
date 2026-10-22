import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeleteAccountButton } from './DeleteAccountButton';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), signOut: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke }, auth: { signOut: mocks.signOut } } }));

describe('account deletion confirmation', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires all six code digits and explicit irreversible acknowledgement', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, sent: ['whatsapp'] }, error: null });
    render(<DeleteAccountButton />);
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת החשבון' }));
    fireEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }));
    const input = await screen.findByRole('textbox', { name: 'קוד אימות למחיקת החשבון' });
    fireEvent.change(input, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'מחיקה סופית' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '123456' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'מחיקה סופית' })).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'מחיקה סופית' })).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});