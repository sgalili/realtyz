/**
 * One sorting vocabulary for every listing view ("הנכסים שלי", the home board,
 * …). The option list, the Hebrew labels and the comparison rules all live here
 * so a sort menu can never drift from the page next to it.
 */
export const LISTING_SORT_OPTIONS = [
  { value: 'relevance', label: 'רלוונטיות' },
  { value: 'price_asc', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
  { value: 'rooms_desc', label: 'הכי הרבה חדרים' },
  { value: 'size_desc', label: 'הכי גדול (מ״ר)' },
  { value: 'newest', label: 'החדשים ביותר' },
] as const;

export type ListingSortValue = (typeof LISTING_SORT_OPTIONS)[number]['value'];

export const LISTING_SORT_LABELS = Object.fromEntries(
  LISTING_SORT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ListingSortValue, string>;

const numOr = (value: number | null | undefined, fallback: number) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : fallback;

/** Rows the board can sort: price, rooms and area are enough for every option. */
export type SortableListingRow = { price?: number | null; rooms?: number | null; sqm?: number | null };

/**
 * Applies a sort choice to board rows.
 *
 * "relevance" keeps the order the board already built (the viewer's own dragged
 * row order first), while "newest" keeps the server's newest-first feed order.
 * Missing values always sink to the bottom, exactly like the property page.
 */
export function sortListingRows<T extends SortableListingRow>(rows: T[], sortBy: ListingSortValue): T[] {
  if (sortBy === 'relevance' || sortBy === 'newest') return rows;
  const next = [...rows];
  switch (sortBy) {
    case 'price_asc':
      return next.sort((a, b) => numOr(a.price, Number.POSITIVE_INFINITY) - numOr(b.price, Number.POSITIVE_INFINITY));
    case 'price_desc':
      return next.sort((a, b) => numOr(b.price, Number.NEGATIVE_INFINITY) - numOr(a.price, Number.NEGATIVE_INFINITY));
    case 'rooms_desc':
      return next.sort((a, b) => numOr(b.rooms, -1) - numOr(a.rooms, -1));
    case 'size_desc':
      return next.sort((a, b) => numOr(b.sqm, -1) - numOr(a.sqm, -1));
    default:
      return rows;
  }
}
