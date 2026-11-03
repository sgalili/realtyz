import { describe, expect, it } from 'vitest';
import { LISTING_SORT_LABELS, LISTING_SORT_OPTIONS, sortListingRows } from './listingSortOptions';

const rows = [
  { price: 500_000, rooms: 3, sqm: 70 },
  { price: 100_000, rooms: 5, sqm: 40 },
  { price: null, rooms: null, sqm: null },
  { price: 900_000, rooms: 1, sqm: 120 },
];

describe('shared listing sorting', () => {
  it('offers exactly the property-page sort options in order', () => {
    expect(LISTING_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'relevance', 'price_asc', 'price_desc', 'rooms_desc', 'size_desc', 'newest',
    ]);
    expect(LISTING_SORT_LABELS.price_asc).toBe('מחיר: נמוך לגבוה');
    expect(LISTING_SORT_LABELS.newest).toBe('החדשים ביותר');
  });

  it('sorts cheap first and keeps a missing price at the bottom', () => {
    expect(sortListingRows(rows, 'price_asc').map((row) => row.price)).toEqual([100_000, 500_000, 900_000, null]);
  });

  it('sorts expensive first and keeps a missing price at the bottom', () => {
    expect(sortListingRows(rows, 'price_desc').map((row) => row.price)).toEqual([900_000, 500_000, 100_000, null]);
  });

  it('sorts most rooms first and largest area first', () => {
    expect(sortListingRows(rows, 'rooms_desc').map((row) => row.rooms)).toEqual([5, 3, 1, null]);
    expect(sortListingRows(rows, 'size_desc').map((row) => row.sqm)).toEqual([120, 70, 40, null]);
  });

  it('leaves the board order untouched for relevance and newest', () => {
    expect(sortListingRows(rows, 'relevance')).toBe(rows);
    expect(sortListingRows(rows, 'newest')).toBe(rows);
  });
});
