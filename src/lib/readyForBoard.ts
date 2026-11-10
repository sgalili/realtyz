import { isTerminalListing } from './publicationSettings';

export type BoardPublicationCandidate = {
  status: string | null;
  city: string | null;
  address: string | null;
  asking_price: number | null;
  is_published: boolean | null;
  affiliate_enabled: boolean | null;
  canonical_duplicate_of?: string | null;
};

/** Same readiness criteria as explicit inventory promotion. */
export function isReadyForBoard(row: BoardPublicationCandidate): boolean {
  return !isTerminalListing(row.status) && !row.canonical_duplicate_of && Boolean(row.city?.trim()) && Boolean(row.address?.trim())
    && Number(row.asking_price) > 0
    && !(row.is_published && row.affiliate_enabled && row.status === 'live');
}