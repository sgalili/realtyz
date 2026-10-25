import { describe, expect, it } from 'vitest';
import { selectedCampaignChannels } from './campaignCreationChannel';

describe('single-channel campaign creation', () => {
  it.each(['facebook', 'instagram', 'whatsapp', 'sms', 'ivr', 'email'])(
    'selects only %s, without retaining the previous destination', (channel) => {
      const previous = selectedCampaignChannels('facebook');
      const selected = selectedCampaignChannels(channel);
      expect([...selected]).toEqual([channel]);
      expect(selected).not.toBe(previous);
    },
  );
  it('does not default to Facebook before channel selection', () => {
    expect([...selectedCampaignChannels(null)]).toEqual([]);
  });
});