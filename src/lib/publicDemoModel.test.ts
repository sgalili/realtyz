import { expect, it } from 'vitest';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import { DEMO_POST_LIMIT, demoProperties, simulatedMetrics } from './publicDemoModel';

it('always creates exactly five simulation properties regardless of source count', () => {
  expect(DEMO_POST_LIMIT).toBe(5);
  expect(demoProperties([])).toHaveLength(5);
  expect(demoProperties(Array.from({ length: 20 }, () => ({ city: 'רמת גן' } as PublicCard)))).toHaveLength(5);
});
it('drops original identity, exact address, contact data and original commission amounts', () => {
  const source = { id: 'private-original-id', street: 'original street', price: 3000000, city: 'רמת גן', rooms: 4, deal_type: 'sale', photos: [], affiliate_tier4_amount: 123456, attribution: { broker_name: 'Private Name' }, contact_options: { phone: '972509999999' } } as unknown as PublicCard;
  const property = demoProperties([source])[0];
  expect(property.id).toBe('demo-property-1');
  expect(property.street).not.toBe(source.street);
  expect(property.price).toBe(2910000);
  expect(property.rewards).toEqual([25, 60, 120, 11640]);
  expect(JSON.stringify(property)).not.toContain('Private Name');
  expect(JSON.stringify(property)).not.toContain('972509999999');
  expect(JSON.stringify(property)).not.toContain('123456');
});
it('simulates increasing engagement but keeps the comment set small and internally consistent', () => {
  const first = simulatedMetrics(0, 0), later = simulatedMetrics(0, 12);
  expect(first.comments).toBe(2);
  expect(later.comments).toBe(3);
  expect(later.likes).toBeGreaterThan(first.likes);
  expect(later.shares).toBeGreaterThan(first.shares);
  expect(later.views).toBeGreaterThan(first.views);
  expect(simulatedMetrics(0, 1000).comments).toBe(3);
});