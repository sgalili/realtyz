import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RewardDialog } from './RewardDialog';
import type { BrokerAffiliateListing } from '@/hooks/useAffiliate';
const save = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAffiliate', () => ({ useSetAffiliateReward: () => ({ mutate: save, isPending: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'workspace' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: async () => ({ data: null }) } }));
afterEach(() => { cleanup(); localStorage.clear(); save.mockClear(); });
describe('existing reward settings', () => {
  it('does not load pricing drafts belonging to another workspace', () => {
    localStorage.setItem('affiliate-settings-draft:viewer:other:isolated', JSON.stringify({ tier4: '99999' }));
    const listing = { id: 'isolated', affiliate_enabled: true, asking_price: 2000000, deal_type: 'sale', affiliate_tier4_type: 'fixed', affiliate_tier4_amount: 10000 } as unknown as BrokerAffiliateListing;
    render(<RewardDialog listing={listing} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ tier4Amount: 10000 }), expect.anything());
  });
  it('clears each daily cap when its own price is cleared', () => {
    const listing = { id: 'limits', affiliate_enabled: true, asking_price: 2000000, deal_type: 'sale', affiliate_tier1_amount: 100, affiliate_tier2_amount: 200, affiliate_tier3_amount: 300, contact_options: { lead_daily_limits: { form: 5, whatsapp: 3, phone: 2 } } } as unknown as BrokerAffiliateListing;
    render(<RewardDialog listing={listing} open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'עמלה עבור סינון בווטסאפ' }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ contactOptions: expect.objectContaining({ lead_daily_limits: { form: 5, whatsapp: null, phone: 2 } }) }), expect.anything());
  });
  it.each([['fixed', 10000], ['percent', 1.2]])('retains untouched %s closing price, caps and form fields', (type, amount) => {
    const form_fields = [{ id: 'q', label: 'תאריך', type: 'date', required: true }];
    const listing = { id: 'listing', affiliate_enabled: true, asking_price: 2000000, deal_type: 'sale', affiliate_tier1_amount: 100, affiliate_tier2_amount: 200, affiliate_tier3_amount: 300, affiliate_tier4_type: type, affiliate_tier4_amount: amount, contact_options: { lead_daily_limits: { form: 5, whatsapp: 3, phone: 2 }, questions: ['תקציב?'], questions_phone: [], form_fields } } as unknown as BrokerAffiliateListing;
    render(<RewardDialog listing={listing} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ tier4Type: type, tier4Amount: amount, contactOptions: expect.objectContaining({ lead_daily_limits: { form: 5, whatsapp: 3, phone: 2 }, questions: ['תקציב?'], questions_phone: [], form_fields }) }), expect.anything());
  });
});