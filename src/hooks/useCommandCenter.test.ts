import { describe, expect, it } from 'vitest';
import { COMMAND_CENTER_LISTING_COLUMNS, listingPropertyTypeOf } from './useCommandCenter';

describe('command center property query', () => {
  it('selects only existing listings columns', () => {
    const columns = COMMAND_CENTER_LISTING_COLUMNS.split(',').map((column) => column.trim());
    expect(columns).not.toContain('property_type');
    expect(columns).toEqual(expect.arrayContaining(['property_title', 'address', 'features', 'attributes']));
  });

  it('keeps the property type label from existing property details', () => {
    expect(listingPropertyTypeOf({ features: { property_type: 'דירת גן' } })).toBe('דירת גן');
    expect(listingPropertyTypeOf({ attributes: { property_type: 'פנטהאוז' } })).toBe('פנטהאוז');
    expect(listingPropertyTypeOf({ attributes: { text: "בית פרטי/ קוטג'" } })).toBe("בית פרטי/ קוטג'");
  });
});
