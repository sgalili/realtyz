import { describe, expect, it } from 'vitest';
import { extractProjectHierarchy, savedProjectHierarchy } from '../../supabase/functions/_shared/projectHierarchy';
import { developerProjectImages, mergeImportedProject, projectMatches } from './developerProjectBoard';
import { EMPTY_PROPERTY_FILTER } from './leadTypeFilter';
const source = { buildings: [
  { id: 'a', name: 'A', units: [{ id: '1', rooms: 3, price: 1800000, floor: 0, size: 80, balconyArea: 12 }] },
  { id: 'b', name: 'B', units: [{ id: '1', price: 2500000, floor: 4, size: 110, specifications: 'ממ״ד' }] },
] };
describe('developer project hierarchy', () => {
  it('uses the actual project cover rather than advertiser logos as the first photo', () => {
    expect(developerProjectImages({ image_url: 'https://media.test/logo/company.webp', images: ['https://media.test/logo/company.webp', 'https://media.test/gallery/2.webp'], source_details: { coverImage: 'https://media.test/mainImage/1.webp' } })).toEqual(['https://media.test/mainImage/1.webp', 'https://media.test/gallery/2.webp']);
  });
  it('keeps repeated unit IDs in distinct buildings and units without rooms', () => {
    const result = extractProjectHierarchy(source);
    expect(result.buildings).toHaveLength(2);
    expect(result.apartments).toHaveLength(2);
    expect(result.buildings[0].units[0]).toMatchObject({ building_id: 'a', floor: '0', balcony_sqm: 12 });
    expect(result.buildings[1].units[0]).toMatchObject({ building_id: 'b', rooms: null, price: 2500000 });
  });
  it('does not collect related units as project inventory', () => {
    expect(extractProjectHierarchy({ ...source, related: { units: [{ id: 'other', price: 1 }] } }).apartments).toHaveLength(2);
  });
  it('merges a partial nonempty sync without erasing buildings, specs or overrides', () => {
    const hierarchy = extractProjectHierarchy(source);
    const old = { name: 'Original', apartments: hierarchy.apartments, source_details: { hierarchy, manual: { specifications: 'Manual', project_overrides: { name: 'Edited' } } } };
    const fresh = { name: 'Source', apartments: [{ source_unit_id: '1', building_id: 'a', price: null, rooms: 4 }], source_details: { hierarchy: { buildings: [{ source_building_id: 'a', units: [] }] } } };
    const merged = mergeImportedProject(old, fresh);
    const result = savedProjectHierarchy(merged);
    expect(merged.name).toBe('Edited');
    expect(result.buildings).toHaveLength(2);
    expect(result.apartments).toHaveLength(2);
    expect(result.buildings[0].units[0]).toMatchObject({ rooms: 4, price: 1800000, balcony_sqm: 12 });
  });
  it('matches price and room constraints against the same unit rather than project minimum', () => {
    const hierarchy = extractProjectHierarchy(source);
    const project = { name: 'Tower', city: 'תל אביב', price_from: 1, apartments: hierarchy.apartments, source_details: { hierarchy } };
    expect(projectMatches(project, 'Tower', { sale: true, rent: true }, { ...EMPTY_PROPERTY_FILTER, priceMin: 1700000, priceMax: 1900000, roomsMin: 3 })).toBe(true);
    expect(projectMatches(project, '', { sale: true, rent: true }, { ...EMPTY_PROPERTY_FILTER, priceMin: 2400000, roomsMin: 3 })).toBe(false);
    expect(projectMatches(project, '', { sale: false, rent: true }, EMPTY_PROPERTY_FILTER)).toBe(false);
  });
});