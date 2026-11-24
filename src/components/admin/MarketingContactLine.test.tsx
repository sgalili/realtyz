import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketingContactLine } from './MarketingContactLine';

const state = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  return { eq, update, from: vi.fn().mockReturnValue({ update }) };
});
vi.mock('@/hooks/useSuperAdminGate', () => ({ useSuperAdminGate: () => ({ enabled: true, uid: 'admin' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
vi.mock('./MarketingCompanyLine', () => ({ MarketingCompanyLine: () => null }));

const baseContact = {
  company_id: 'company-1',
  company_name: 'חברת שיווק',
  contact_name: 'מורן',
  contact_phone: '972509999999',
  contact_gender: null,
};

function renderLine(contact: Partial<Omit<typeof baseContact, 'contact_gender'>> & { contact_gender?: string | null }) {
  render(<QueryClientProvider client={new QueryClient()}><MarketingContactLine ownerId="owner-1" devName="יזם" contact={{ ...baseContact, ...contact }} /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  state.from.mockClear();
  state.update.mockClear();
  state.eq.mockClear();
});

it('shows no gender controls until contact editing is opened, then saves the selected gender with the contact', async () => {
  renderLine({ contact_gender: null });
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('img', { name: /^מגדר איש הקשר:/ })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'עריכת איש הקשר' }));
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  fireEvent.click(screen.getByRole('radio', { name: 'נקבה' }));
  fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));

  await waitFor(() => expect(state.update).toHaveBeenCalledWith({
    contact_name: 'מורן',
    contact_phone: '972509999999',
    contact_gender: 'female',
  }));
});

it('shows only the selected gender indicator in the closed card', () => {
  renderLine({ contact_gender: 'male' });
  expect(screen.getByRole('img', { name: 'מגדר איש הקשר: זכר' })).toBeTruthy();
  expect(screen.queryByRole('img', { name: 'מגדר איש הקשר: נקבה' })).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
});
