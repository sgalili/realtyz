import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerCertificateCheck } from './BrokerCertificateCheck';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'self' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke } } }));
afterEach(() => { cleanup(); state.invoke.mockReset(); });
it('keeps a missing certificate license unmatched and retryable after a completed lookup', async () => {
  const result = { matched: false, code: 'license_not_found', licenseNumber: '318317', fullName: 'ישראל ישראלי', message: 'הרישיון לא נמצא' };
  state.invoke.mockResolvedValue({ data: result, error: null });
  const onResult = vi.fn();
  render(<BrokerCertificateCheck onResult={onResult} />);
  fireEvent.change(screen.getByLabelText('בדיקת תעודת רישיון מול המרשם'), { target: { files: [new File(['image'], 'certificate.jpg', { type: 'image/jpeg' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'בדיקת התעודה' }));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(result));
  expect(onResult.mock.calls.some(([value]) => value?.matched === true)).toBe(false);
  expect(screen.getByRole('button', { name: 'בדיקת התעודה' })).toBeEnabled();
});