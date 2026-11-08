/** New campaigns discard navigation context, not saved workspace drafts. */
export function newCampaignSearch(): URLSearchParams {
  return new URLSearchParams({ tab: 'create' });
}