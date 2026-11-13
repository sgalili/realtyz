import { describe, expect, it } from 'vitest';
import { groupedNotificationCounts } from './communityNotify';

describe('grouped chat notifications', () => {
  it('collapses messages from the same chat into one count', () => {
    let c = groupedNotificationCounts({}, 'peer-a', 1);
    c = groupedNotificationCounts(c, 'peer-a', 2);
    c = groupedNotificationCounts(c, 'peer-b', 1);
    expect(c).toEqual({ 'peer-a': 3, 'peer-b': 1 });
  });
});
