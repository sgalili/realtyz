import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewLeadDialog from './NewLeadDialog';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), invoke: vi.fn(), saved: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert: mocks.insert }), functions: { invoke: mocks.invoke } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-a' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'owner-a' }));
vi.mock('@/hooks/useServiceAreas', () => ({ useServiceAreas: () => ({ isConfigured: false, serviceAreas: [], checkInArea: () => true }) }));
vi.mock('@/hooks/useHomelyConnection', () => ({ useHomelyConnection: () => ({ connected: false }) }));
vi.mock('@/components/leads/LinkedPropertiesField', () => ({ default: () => null, saveLeadPropertyLinks: vi.fn() }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

describe('lead form save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: { id: 'lead-a' }, error: null }) }) });
    mocks.invoke.mockResolvedValue({ data: { updated: 1 }, error: null });
  });
  it('saves the chosen role and normalized phone in the owning workspace, then hydrates the avatar and returns the lead', async () => {
    render(<QueryClientProvider client={new QueryClient()}><NewLeadDialog open onOpenChange={() => {}} onCreated={mocks.saved} /></QueryClientProvider>);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'renter' } });
    fireEvent.change(screen.getByLabelText('שם מלא *'), { target: { value: 'דנה ישראלי' } });
    fireEvent.change(screen.getByLabelText('טלפון *'), { target: { value: '0501234567' } });
    fireEvent.click(screen.getByRole('button', { name: /שוכר/ }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledWith({ id: 'lead-a', full_name: 'דנה ישראלי', phone_number: '972501234567', email: null }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ phone_number: '972501234567', workspace_owner_id: 'owner-a', deal_type: 'rent', gender: null, preferences: expect.objectContaining({ lead_kind: 'renter' }) }));
    expect(mocks.invoke).toHaveBeenCalledWith('fetch-wa-avatars', { body: { lead_ids: ['lead-a'] } });
  });
});