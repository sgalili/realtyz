import { describe, expect, it } from 'vitest';
import { newCampaignSearch } from './campaignEntry';
describe('new campaign entry', () => {
  it('always starts channel selection without stale channel, recipients, scheduling or property context', () => {
    expect(newCampaignSearch().toString()).toBe('tab=create');
    expect(newCampaignSearch().has('channel')).toBe(false);
  });
});