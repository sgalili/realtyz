import { describe, expect, it } from 'vitest';
import { developerImportUrl } from './developerImportUrl';
import { readPage, mergeProject } from '../../supabase/functions/yad2-developer-import/extract';

describe('developer import', () => {
  it('accepts only the main developer page, never an individual listing or project', () => {
    expect(developerImportUrl('https://www.yad2.co.il/yad1/developers/acme')).toBeTruthy();
    for (const value of ['https://www.yad2.co.il/realestate/item/123', 'https://www.yad2.co.il/yad1/project/123', 'https://yad2.co.il.evil.test/yad1/developers/a', 'https://www.yad2.co.il/yad1/developers/a/project/1']) expect(developerImportUrl(value)).toBeNull();
  });
  it('keeps projects separate, including all source unit details, images and floor zero', () => {
    const data = { developer: { name: 'Company' }, projects: [
      { id: 'a', name: 'A', city: { text: 'אשדוד' }, url: '/yad1/project/a', images: [{ url: 'https://media.example/a' }], apartments: [{ id: 'u', rooms: 4, floor: 0, price: 2000000, images: ['https://media.example/unit'], balconyArea: 12 }] },
      { id: 'b', name: 'B', units: [{ rooms: 3, size: 80, price: 1800000 }] },
    ], related: [{ projectName: 'Unrelated project', projectId: 'unrelated', city: 'Other', apartments: [{ rooms: 2, price: 1 }] }] };
    const result = readPage(`<script type="application/json">${JSON.stringify(data)}</script>`, 'https://www.yad2.co.il/yad1/developers/company');
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].city).toBe('אשדוד');
    expect(result.projects[0].apartments[0].floor).toBe('0');
    expect(result.projects[0].apartments[0].source_details.balconyArea).toBe(12);
    expect(result.projects[0].images).toContain('https://media.example/a');
    expect(result.projects[1].apartments).toHaveLength(1);
    expect(result.links).toContain('https://www.yad2.co.il/yad1/project/a');
  });
  it('merges richer linked detail without losing summary or duplicating units', () => {
    const summary = { name: 'A', total_units: 50, images: ['a'], apartments: [{ source_unit_id: 'u', rooms: 3 }], source_details: { summary: true } };
    const detail = { name: 'A', total_units: null, images: ['a', 'b'], apartments: [{ source_unit_id: 'u', rooms: 3, floor: '2' }], source_details: { details: true } };
    const merged = mergeProject(summary, detail);
    expect(merged.total_units).toBe(50);
    expect(merged.images).toEqual(['a', 'b']);
    expect(merged.apartments).toHaveLength(1);
    expect(merged.source_details).toEqual({ summary: true, details: true });
  });
});