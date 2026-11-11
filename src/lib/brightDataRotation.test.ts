import { describe, expect, it } from 'vitest';
import { rotatingUnlockerPayload, rotationDiagnostics, unlockerRequestOptions } from '../../supabase/functions/_shared/brightDataRotation';

describe('provider-managed rotation', () => {
  it('never pins pagination or listing requests to a sticky session or IP', () => {
    for (const url of ['https://www.yad2.co.il/realestate/forsale?page=2', 'https://www.yad2.co.il/realestate/item/abc']) {
      const payload = rotatingUnlockerPayload('zone', url);
      expect(payload).not.toHaveProperty('session');
      expect(payload).not.toHaveProperty('ip');
      expect(payload.url).toBe(url);
    }
  });
  it('sends only the specified raw Web Unlocker body for pagination and item targets', () => {
    for (const url of ['https://www.yad2.co.il/realestate/forsale?page=2', 'https://www.yad2.co.il/realestate/item/abc']) {
      expect(JSON.parse(String(unlockerRequestOptions('test-key', 'web_unlocker4', url).body)))
        .toEqual({ zone: 'web_unlocker4', url, format: 'raw' });
    }
  });
  it('uses POST with JSON content type and a Bearer credential', () => {
    const request = unlockerRequestOptions('test-key', 'web_unlocker4', 'https://www.yad2.co.il');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer test-key' });
  });
  it('extracts only bounded peer and request identifiers, not the full debug payload', () => {
    expect(rotationDiagnostics('{"peer_ip":"peer1","req_id":"request1","secret":"hidden"}')).toEqual({peerId:'peer1',requestId:'request1'});
    expect(rotationDiagnostics('invalid')).toEqual({});
  });
});