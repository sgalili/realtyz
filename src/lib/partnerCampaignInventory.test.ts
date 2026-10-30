import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { fetchPartnerCampaignInventory } from './partnerCampaignInventory';
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, city: 'חיפה', street: 'הרצל', neighborhood: null, rooms: 3, sqm: 80, floor: 2, price: 2000, deal_type: 'rent', description: 'פרטי נכס', photos: ['photo'], affiliate_enabled: true, ...extra });
beforeEach(() => mocks.invoke.mockReset());
it('includes every available partner property across all feed pages regardless of workspace', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { properties: [card('foreign-a'), card('own-private', { affiliate_enabled: false })], has_more: true } }).mockResolvedValueOnce({ data: { properties: [card('foreign-b')], has_more: false } });
  expect((await fetchPartnerCampaignInventory(false)).map(row => row.id)).toEqual(['foreign-a', 'foreign-b']);
  expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'public-listings-board?limit=60&offset=60', { method: 'GET' });
});
it('excludes closing-only listings for an unverified partner but retains them for verified brokers', async () => {
  mocks.invoke.mockResolvedValue({ data: { properties: [card('closing-only', { reward_types: { form: false, whatsapp: false, phone: false, closing: true } }), card('lead-offer')], has_more: false } });
  expect((await fetchPartnerCampaignInventory(false)).map(row => row.id)).toEqual(['lead-offer']);
  expect((await fetchPartnerCampaignInventory(true)).map(row => row.id)).toEqual(['closing-only', 'lead-offer']);
});
it('maps the exact property and price without copying owner, reward or nested private metadata', async () => {
  mocks.invoke.mockResolvedValue({ data: { properties: [card('exact', { owner_phone: 'private', affiliate_tier4_amount: 5000, source_metadata: { phone: 'private' }, features: { deal_closing_commission: 5000 } })] } });
  const rows = await fetchPartnerCampaignInventory(false);
  expect(rows[0]).toMatchObject({ id: 'exact', asking_price: 2000, deal_type: 'rent', address: 'הרצל', media_photos: ['photo'], features: null, source_metadata: null });
  expect(rows[0]).not.toHaveProperty('owner_phone');
  expect(rows[0]).not.toHaveProperty('affiliate_tier4_amount');
});
it('fails instead of replacing unavailable public inventory with private workspace rows', async () => {
  mocks.invoke.mockResolvedValue({ error: new Error('unavailable') });
  await expect(fetchPartnerCampaignInventory(false)).rejects.toThrow('unavailable');
});