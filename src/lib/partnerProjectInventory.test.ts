import { describe, expect, it } from 'vitest';
import { partnerProjectInventory } from './partnerProjectInventory';
import type { DeveloperProject } from './developerProjectForm';

const project = (extra: Record<string, unknown> = {}) => ({ id: 'saved', name: 'Company project', status: 'draft', price_from: 1800000, images: [], source_details: {}, apartments: [], ...extra }) as unknown as DeveloperProject;
describe('partner company inventory', () => {
  it('includes every saved project even if unpublished and has no imported units', () => {
    const records = partnerProjectInventory([project(), project({ id: 'second', status: 'pending' })]);
    expect(records.map(record => record.result.key)).toEqual(['project:saved', 'project:second']);
  });
  it('includes all actual unit records without inventing unavailable prices', () => {
    const records = partnerProjectInventory([project({ apartments: [{ source_unit_id: 'one', rooms: 3, price: 2000000 }, { source_unit_id: 'two', rooms: 4, price: null }] })]);
    expect(records).toHaveLength(3);
    expect(records[1].result.price).toBe(2000000);
    expect(records[2].result.price).toBeNull();
  });
  it('keeps equal unit IDs in different buildings as separate inventory', () => {
    const records = partnerProjectInventory([project({ apartments: [{ source_unit_id: 'one', building_id: 'A' }, { source_unit_id: 'one', building_id: 'B' }] })]);
    expect(new Set(records.map(record => record.result.key)).size).toBe(3);
  });
});