import { describe, expect, it } from 'vitest';
import { ACTIVE_CAP, RESERVE_CAP, membershipOutcome, approvedAnswers } from '../../cloud-runner/groupPolicy.js';
describe('cloud membership compliance', () => {
  it('caps active publishing groups at 100', () => expect(ACTIVE_CAP).toBe(100));
  it('caps pending reserve groups at 200', () => expect(RESERVE_CAP).toBe(200));
  it('does not mistake approval requests for membership', () => expect(membershipOutcome('Cancel request')).toBe('requested'));
  it('only recognizes explicit membership evidence', () => { expect(membershipOutcome('Join group')).toBeNull(); expect(membershipOutcome('Leave group')).toBe('joined'); });
  it('does not invent missing membership answers', () => expect(approvedAnswers(['City?'], {}, true)).toBeNull());
  it('requires rules consent before answering', () => expect(approvedAnswers(['City?'], {'City?':'Haifa'},false)).toBeNull());
  it('retains supplied answers exactly', () => expect(approvedAnswers(['City?'], {'City?':'Haifa'},true)).toEqual({'City?':'Haifa'}));
});