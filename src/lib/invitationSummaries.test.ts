import { describe, expect, it } from 'vitest';
import { defaultSummaryId, recipientGroup } from './invitationSummaries';
describe('invitation summaries', () => {
  const files = [{ id: 'a', summary_role: 'developer' }, { id: 'b', summary_role: 'broker' }, { id: 'c', summary_role: null }];
  it('defaults to the summary of the recipient type', () => { expect(defaultSummaryId(files, 'broker')).toBe('b'); });
  it('attaches nothing when that type has no summary', () => { expect(defaultSummaryId(files, 'affiliate')).toBeNull(); });
  it('groups a developer invite sent to a marketing company under marketing', () => { expect(recipientGroup({ recipient_kind: 'developer' }, 'אלמוגים שיווק')).toBe('marketing'); });
  it('keeps developers without a marketing company under developers', () => { expect(recipientGroup({ recipient_kind: 'developer' }, null)).toBe('developer'); });
  it('puts other recipients under brokers', () => { expect(recipientGroup({ recipient_kind: 'broker' })).toBe('broker'); });
});
