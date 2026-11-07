import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { QuickPublicPromotion } from './QuickPublicPromotion';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  publish: vi.fn(),
  roles: ['agent'] as string[],
}));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'workspace-1', activeWorkspace: { role: 'user', workspace_name: 'משרד' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ roles: mocks.roles, loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/publishInventory', () => ({ publishInventory: mocks.publish, publicationErrorMessage: () => 'הפרסום נכשל' }));

describe('broker approval publication access', () => {
  it('allows an approved broker to publish even when the membership still says user', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'pending', is_published: false, affiliate_enabled: false };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [property], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.publish.mockResolvedValue(['property-1']);
    const onPublished = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><QuickPublicPromotion ids={['property-1']} onPublished={onPublished} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'אישור ופרסום' }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), 'workspace-1', ['property-1']));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(['property-1']));
  });
});