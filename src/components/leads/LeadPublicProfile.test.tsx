import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LeadPublicProfile } from './LeadPublicProfile';

const state = vi.hoisted(() => ({ data: { id: 'client', full_name: 'דנה כהן', avatar_url: null, city: 'הרצליה', category: 'buyer', can_manage: false, phone_number: null as string | null } }));
vi.mock('@/hooks/useLeadProfileAccess', () => ({ useLeadProfileAccess: () => ({ data: state.data, isLoading: false }) }));
afterEach(() => { cleanup(); state.data.can_manage = false; state.data.phone_number = null; });
const show = (onManage = vi.fn(), onClose = vi.fn()) => render(<MemoryRouter><LeadPublicProfile leadId="client" onManage={onManage} onClose={onClose} /></MemoryRouter>);
it('withholds contact and management actions when the server denies permission', () => {
  show();
  expect(screen.queryByRole('link', { name: 'חיוג' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'עריכה / ניהול' })).toBeNull();
  expect(screen.getByRole('button', { name: 'שליחת הודעה' })).toBeInTheDocument();
});
it('opens authorized management without clearing the selected client', () => {
  state.data.can_manage = true;
  const manage = vi.fn(), close = vi.fn();
  show(manage, close);
  fireEvent.click(screen.getByRole('button', { name: 'עריכה / ניהול' }));
  expect(manage).toHaveBeenCalledWith('client');
  expect(close).not.toHaveBeenCalled();
});
it('offers a call only using the server-authorized own-client phone', () => {
  state.data.phone_number = '972501234567';
  show();
  expect(screen.getByRole('link', { name: 'חיוג' })).toHaveAttribute('href', 'tel:972501234567');
});