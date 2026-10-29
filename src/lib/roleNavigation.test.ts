import { expect, it } from 'vitest';
import { rolePageAllowed } from './roleNavigation';
it.each(['partner', 'private'] as const)('%s cannot enter broker dashboards, properties or tours', audience => {
  for (const path of ['/dashboard', '/properties', '/properties/123', '/properties-hub', '/developer-dashboard', '/lead-crm', '/tours']) expect(rolePageAllowed(audience, path)).toBe(false);
});
it('partners retain approved task, transaction and marketing views', () => {
  for (const path of ['/command-center', '/deal-room', '/activity-history', '/posts', '/partner/chats', '/my-ads', '/sharing-pool']) expect(rolePageAllowed('partner', path)).toBe(true);
});
it('brokers retain their original core routes', () => expect(rolePageAllowed('professional', '/properties')).toBe(true));