import { expect, it } from 'vitest';
import { publicCampaignProperty } from '../../supabase/functions/_shared/publicCampaignProperty';

it('only uses facts for the exact selected public property', () => {
  expect(publicCampaignProperty({ id: 'other', asking_price: 7000 }, 'selected')).toBeNull();
  expect(publicCampaignProperty({ id: 'selected', asking_price: 7000, city: 'חיפה' }, 'selected')).toEqual({ id: 'selected', asking_price: 7000, city: 'חיפה' });
});
it('excludes private identity, commissions and nested financial data from public campaigns', () => {
  expect(publicCampaignProperty({ id: 'selected', workspace_owner_id: 'foreign', user_id: 'owner', owner_phone: 'private', affiliate_tier4_amount: 40000, features: { deal_closing_commission: 40000 }, source_metadata: { phone: 'private' } }, 'selected')).toEqual({ id: 'selected' });
});