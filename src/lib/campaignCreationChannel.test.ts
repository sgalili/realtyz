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
  it('clears a previously visited Instagram channel on entry to the picker', () => {
    let selected = selectedCampaignChannels('instagram');
    selected = selectedCampaignChannels(null);
    expect(selected.size).toBe(0);
    expect(selected.has('instagram')).toBe(false);
  });
});