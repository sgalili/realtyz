/** A creation screen has one destination, never an accumulated channel set. */
export function selectedCampaignChannels(channel: string | null): Set<string> {
  return new Set(channel ? [channel] : []);
}