import { describe, expect, it } from 'vitest';
import { WEB_UNLOCKER_ZONE, rotatingUnlockerPayload, rotationDiagnostics, unlockerRequestOptions } from '../../supabase/functions/_shared/brightDataRotation';

describe('provider-managed rotation', () => {
  it('uses the requested production Web Unlocker zone', () => {
    expect(WEB_UNLOCKER_ZONE).toBe('web_unlocker4');
  });
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
  it('rotates bounded desktop and mobile user agents on independent background attempts without sticky sessions', () => {
    const first = rotatingUnlockerPayload('web_unlocker4', 'https://www.yad2.co.il/yad1/project/p1', 0) as any;
    const second = rotatingUnlockerPayload('web_unlocker4', 'https://www.yad2.co.il/yad1/project/p2', 1) as any;
    expect(first.headers['User-Agent']).not.toBe(second.headers['User-Agent']);
    expect(first.headers['User-Agent']).toContain('Mozilla/5.0');
    expect(first).not.toHaveProperty('session');
    expect(second).not.toHaveProperty('ip');
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