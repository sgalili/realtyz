import { describe, expect, it } from 'vitest';
import { projectCampaignTargets } from '../../supabase/functions/_shared/projectCampaignTargets';
describe('developer campaign inventory', () => {
  it('includes unpublished project, building and unit from saved hierarchy', () => {
    const targets = projectCampaignTargets({ id: 'p1', name: 'Project', status: 'planning', source_details: { hierarchy: { buildings: [{ id: 'b1', name: 'A', units: [{ id: 'u1', rooms: 4, price: 2300000, size_sqm: 110 }] }] } } });
    expect(targets.map(t => t.id)).toEqual(['project:p1', 'project:p1:building:b1', 'project:p1:unit:b1%3Au1']);
    expect(targets[2].asking_price).toBe(2300000);
    expect(targets[2].rooms).toBe(4);
  });
  it('does not fabricate units for a sparse project', () => {
    expect(projectCampaignTargets({ id: 'p2', name: 'Sparse' })).toHaveLength(1);
  });
});