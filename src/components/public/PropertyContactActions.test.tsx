import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('@/i18n/personalLanguage', () => ({ usePersonalLanguage: () => ({ gender: 'male', command: (v: string) => v }), localizeControlNode: (v: unknown) => v }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/propertyReferral', () => ({ propertyInquiryRef: () => null, personalPropertyLink: vi.fn() }));
vi.mock('./InquiryVerificationDialog', () => ({ default: () => null, inquiryDeviceId: () => 'test-device' }));
import PropertyContactActions from './PropertyContactActions';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup() {
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  render(<MemoryRouter><PropertyContactActions listingId="listing-a" title="נכס בדיקה" options={{ digital: true, phone: true, whatsapp: true }} showShare={false} /></MemoryRouter>);
}
describe('property inquiry submission', () => {
  it('requires name and phone and sends the selected property through the existing gate', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'השארת פרטים' }));
    expect(screen.getByRole('button', { name: 'שליחת פרטים' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/שם מלא/), { target: { value: 'ישראל ישראלי' } });
    fireEvent.change(screen.getByLabelText(/מספר טלפון/), { target: { value: '0501234567' } });
    fireEvent.submit(screen.getByLabelText(/שם מלא/).closest('form') as HTMLFormElement);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('public-lead-gate', { body: expect.objectContaining({ listing_id: 'listing-a', action: 'register', intent: 'digital', name: 'ישראל ישראלי', phone: '050-1234567' }) }));
  });
  it('callback stays a callback without inventing a screened lead', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'שיחת טלפון' }));
    fireEvent.change(screen.getByLabelText(/מספר טלפון/), { target: { value: '0501234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'חייגו אליי' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('public-lead-gate', { body: expect.objectContaining({ listing_id: 'listing-a', action: 'callback', intent: 'phone', form_answers: undefined }) }));
  });
});