import { describe, expect, it } from 'vitest';
import { campaignPublishRoute } from '../../supabase/functions/_shared/campaignPublishRoute';

const base = { channels: ['facebook'], groupCount: 2, publishToPage: true, hasPage: false, cloudActive: true };
describe('campaign publishing credentials', () => {
  it('allows active GoLogin group publishing without a Meta token', () => {
    expect(campaignPublishRoute(base)).toEqual({ runner: 'cloud', publishToPage: false, error: null });
  });
  it('uses only cloud when explicitly selected even if a Page exists', () => {
    expect(campaignPublishRoute({ ...base, hasPage: true, cloudRequested: true }).runner).toBe('cloud');
  });
  it('requires actual targets rather than treating GoLogin as a Page', () => {
    expect(campaignPublishRoute({ ...base, groupCount: 0 }).error).toBe('no_targets');
  });
  it('does not treat configuration alone as authenticated Facebook', () => {
    expect(campaignPublishRoute({ ...base, cloudActive: false, cloudRequested: true }).error).toBe('cloud_not_connected');
  });
  it('still requires Graph credentials for Instagram', () => {
    expect(campaignPublishRoute({ ...base, channels: ['instagram'], cloudRequested: true }).error).toBe('meta_token_unavailable');
  });
  it('retains explicit Page publishing with Page credentials', () => {
    expect(campaignPublishRoute({ ...base, hasPage: true })).toEqual({ runner: 'extension', publishToPage: true, error: null });
  });
  it('keeps group-only publishing independent of Page credentials', () => {
    expect(campaignPublishRoute({ ...base, cloudActive: false, publishToPage: false }).error).toBeNull();
  });
});