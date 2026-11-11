import { describe, expect, it } from 'vitest';
import { rotatingUnlockerPayload, rotationDiagnostics } from '../../supabase/functions/_shared/brightDataRotation';

describe('provider-managed rotation', () => {
  it('never pins pagination or listing requests to a sticky session or IP', () => {
    for (const url of ['https://www.yad2.co.il/realestate/forsale?page=2', 'https://www.yad2.co.il/realestate/item/abc']) {
      const payload = rotatingUnlockerPayload('zone', url, {});
      expect(payload).not.toHaveProperty('session');
      expect(payload).not.toHaveProperty('ip');
      expect(payload.debug).toBe(true);
      expect(payload.url).toBe(url);
    }
  });
  it('extracts only bounded peer and request identifiers, not the full debug payload', () => {
    expect(rotationDiagnostics('{"peer_ip":"peer1","req_id":"request1","secret":"hidden"}')).toEqual({peerId:'peer1',requestId:'request1'});
    expect(rotationDiagnostics('invalid')).toEqual({});
  });
});