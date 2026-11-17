import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RewardDialog } from './RewardDialog';
const row = { id: 'l1', workspace_owner_id: 'ws', user_id: 'viewer', asking_price: 2000000, deal_type: 'sale' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'ws' }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isSuperAdmin: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) } }));
vi.mock('@/components/public/PublicListingPublisher', () => ({ default: (p: { pricingOnly?: boolean; resumeDraft?: { resumeStep?: number } }) => <div data-testid="step8">{String(p.pricingOnly)}:{p.resumeDraft?.resumeStep}</div> }));
describe('reward editing', () => {
  it('opens the Step 8 pricing editor for the listing', async () => {
    render(<RewardDialog listing={{ id: 'l1' } as never} open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('step8').textContent).toBe('true:8'));
  });
});
