/** Internal detail requests use the immutable saved listing ID, not mutable links. */
export function listingDetailIdentifier(listing: { id: string; slug?: string | null }) {
  return listing.id;
}

/** An unavailable listing is an expected state, never permission to search other rows. */
export function isUnavailableListingError(error: unknown) {
  if (!error || typeof error !== 'object' || !('context' in error)) return false;
  const context = error.context;
  return context instanceof Response && context.status === 404;
}