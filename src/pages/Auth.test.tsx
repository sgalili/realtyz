import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Auth from './Auth';
const state = vi.hoisted(() => ({ invoke: vi.fn(), setSession: vi.fn(), verifyOtp: vi.fn(), navigate: vi.fn(), search: '?mode=login' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: state.invoke }, auth: { setSession: state.setSession, verifyOtp: state.verifyOtp } } }));
vi.mock('@/hooks/usePlatformMode', () => ({ useBrokersOnly: () => true }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => state.navigate, useLocation: () => ({ search: state.search, state: {} }) }));
vi.mock('@/i18n/personalToast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); state.search = '?mode=login'; });
describe('OTP primary with read-only demo fallback', () => {
  it('offers demo without contacting the OTP service', () => {
    render(<Auth />);
    const demo = screen.getByRole('link', { name: 'כניסה למרחב דמו' });
    expect(demo).toHaveAttribute('href', '/demo/broker/properties');
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it('does not create a session after OTP rejection and keeps demo available', async () => {
    state.invoke.mockResolvedValueOnce({ data: { channel: 'sms' }, error: null }).mockResolvedValueOnce({ data: { error: 'קוד שגוי', code: 'otp_mismatch' }, error: null });
    render(<Auth />);
    fireEvent.change(screen.getByRole('textbox', { name: 'מספר טלפון נייד' }), { target: { value: '0502222222' } });
    fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד ב-SMS' }));
    const code = await screen.findByRole('textbox', { name: '' });
    fireEvent.change(code, { target: { value: '1111' } });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    expect(state.invoke.mock.calls[1]?.[1].body.action).toBe('verify');
    await screen.findByRole('alert');
    expect(state.setSession).not.toHaveBeenCalled(); expect(state.verifyOtp).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'מרחב הדגמה' })).toHaveAttribute('href', '/demo/broker/properties');
  });
});