import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
const expect = (value: unknown) => ({ toBe: (expected: unknown) => assertEquals(value, expected) });
const describe = (_name: string, fn: () => void) => fn();
const it = Deno.test;
import { visitorBody } from './policy.ts';

const message = { id: '1', role: 'user', parts: [{ type: 'text', text: 'איך מצטרפים?' }] };
describe('anonymous Rita input boundary', () => {
  it('accepts only public text conversation input', () => {
    expect(visitorBody.safeParse({ messages: [message] }).success).toBe(true);
  });
  it('rejects private workspace and tool context', () => {
    expect(visitorBody.safeParse({ messages: [message], workspace_owner_id: 'another-owner' }).success).toBe(false);
    expect(visitorBody.safeParse({ messages: [{ ...message, parts: [{ type: 'tool-call', toolName: 'query_crm' }] }] }).success).toBe(false);
  });
  it('rejects caller-supplied system instructions', () => {
    expect(visitorBody.safeParse({ messages: [{ ...message, role: 'system' }] }).success).toBe(false);
  });
});