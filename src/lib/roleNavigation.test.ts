import { expect, it } from 'vitest';
import { rolePageAllowed } from './roleNavigation';
it.each(['partner', 'private'] as const)('%s cannot enter broker dashboards or tours', audience => {
  for (const path of ['/dashboard', '/properties-hub', '/developer-dashboard', '/lead-crm', '/tours']) expect(rolePageAllowed(audience, path)).toBe(false);
});
it('partners cannot enter My Properties', () => expect(rolePageAllowed('partner', '/properties')).toBe(false));
it('private property owners open My Properties directly', () => {
  expect(rolePageAllowed('private', '/properties')).toBe(true);
  expect(rolePageAllowed('private', '/properties/123')).toBe(true);
});
it('partners retain approved task, transaction and marketing views', () => {
  for (const path of ['/command-center', '/deal-room', '/activity-history', '/posts', '/partner/chats', '/my-ads', '/sharing-pool']) expect(rolePageAllowed('partner', path)).toBe(true);
});
it('brokers retain their original core routes', () => expect(rolePageAllowed('professional', '/properties')).toBe(true));