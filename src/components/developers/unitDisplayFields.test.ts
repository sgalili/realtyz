import { describe, expect, it } from 'vitest';
import { unitDisplayFields } from './ProjectHierarchyDetails';

describe('project apartment details', () => {
  it('shows Hebrew fields only and never raw source keys or Yad2', () => {
    const unit = { source_unit_id: 'u1', building_id: null, building_name: null, rooms: 4, floor: '3', size_sqm: 110, price: 2500000, images: [], type: 'דירה', description: 'פורסם ביד 2', source_details: { slug: 'abc', token: 'x1', adType: 'project', orderId: 9, categoryId: 2 } };
    const fields = unitDisplayFields(unit as never, { name: 'פרויקט הדר', address: 'הרצל 1' } as never);
    const text = JSON.stringify(fields);
    expect(fields).toContainEqual(['חדרים', '4']);
    expect(fields).toContainEqual(['קומה', '3']);
    for (const raw of ['slug', 'token', 'adType', 'orderId', 'categoryId', 'abc', 'x1', 'יד 2']) expect(text).not.toContain(raw);
  });
});
