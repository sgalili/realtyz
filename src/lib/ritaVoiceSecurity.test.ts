import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { equalSecret, verifyElevenLabsPostCallSignature } from './ritaVoiceSecurity.server';

describe('Rita callback security', () => {
  it('accepts a recent valid HMAC signature', () => {
    const raw = JSON.stringify({ type: 'post_call_transcription' });
    const header = `t=1000,v0=${createHmac('sha256', 'secret').update(`1000.${raw}`).digest('hex')}`;
    expect(verifyElevenLabsPostCallSignature(raw, header, 'secret', 1001)).toBe(true);
  });
  it('rejects altered payloads and stale timestamps', () => {
    const raw = '{}';
    const header = `t=1000,v0=${createHmac('sha256', 'secret').update(`1000.${raw}`).digest('hex')}`;
    expect(verifyElevenLabsPostCallSignature('{"changed":true}', header, 'secret', 1001)).toBe(false);
    expect(verifyElevenLabsPostCallSignature(raw, header, 'secret', 1400)).toBe(false);
    expect(verifyElevenLabsPostCallSignature(raw, null, 'secret', 1001)).toBe(false);
  });
  it('compares secrets without leaking their contents', () => {
    expect(equalSecret('same', 'same')).toBe(true);
    expect(equalSecret('one', 'two')).toBe(false);
    expect(equalSecret('', 'two')).toBe(false);
  });
});
