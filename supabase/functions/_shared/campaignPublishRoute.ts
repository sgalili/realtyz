export type PublishRouteInput = {
  channels: string[];
  groupCount: number;
  publishToPage: boolean;
  hasPage: boolean;
  cloudActive: boolean;
  cloudRequested?: boolean;
};

/** Cloud credentials authorize group jobs, never Graph Page/Instagram calls. */
export function campaignPublishRoute(input: PublishRouteInput) {
  const facebookOnly = input.channels.length === 1 && input.channels[0] === 'facebook';
  const cloud = facebookOnly && input.cloudActive &&
    (input.cloudRequested === true || !input.hasPage || !input.publishToPage);
  if (cloud) return input.groupCount > 0
    ? { runner: 'cloud' as const, publishToPage: false, error: null }
    : { runner: 'cloud' as const, publishToPage: false, error: 'no_targets' };
  if (input.cloudRequested && facebookOnly) {
    return { runner: 'cloud' as const, publishToPage: false, error: 'cloud_not_connected' };
  }
  const graphRequired = input.channels.some(channel => channel !== 'facebook') || input.publishToPage;
  return {
    runner: 'extension' as const,
    publishToPage: input.publishToPage,
    error: graphRequired && !input.hasPage ? 'meta_token_unavailable'
      : !graphRequired && input.groupCount === 0 ? 'no_targets' : null,
  };
}