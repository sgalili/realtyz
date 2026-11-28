import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectVoiceConnection, syncElevenLabsAgent } from './voiceAgent.server';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const row: Database['public']['Tables']['voice_agents']['Row'] = {
  id: 'record', user_id: 'owner', availability: 'away', elevenlabs_agent_id: 'agent',
  elevenlabs_voice_id: 'voice', elevenlabs_phone_number: null, greeting: 'שלום',
  language: 'he', last_synced_at: '2026-11-28T00:00:00Z', created_at: '2026-11-28T00:00:00Z', updated_at: '2026-11-28T00:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
describe('ElevenLabs live state boundaries', () => {
  it('does not equate a saved agent ID with a verified connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ agent_id: 'agent', tags: ['toraff-owner:someone-else'] })));
    const state = await inspectVoiceConnection(row, 'owner', 'test-key');
    expect(state.agentVerified).toBe(false);
    expect(state.settingsMatch).toBe(false);
  });
  it('compares live language, voice and greeting before confirming synchronization', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ tags: ['toraff-owner:owner'], conversation_config: { agent: { language: 'en', first_message: 'שלום' }, tts: { voice_id: 'voice' } } })));
    const state = await inspectVoiceConnection(row, 'owner', 'test-key');
    expect(state.agentVerified).toBe(true);
    expect(state.settingsMatch).toBe(false);
  });
  it('never reassigns a number belonging to another provider agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ phone_number_id: 'phone', phone_number: '+972500000034', assigned_agent: { agent_id: 'other-agent' } }]));
    vi.stubGlobal('fetch', fetchMock);
    const client = {} as SupabaseClient<Database>;
    await expect(syncElevenLabsAgent(client, 'owner', { ...row, elevenlabs_phone_number: '+972500000034' }, {}, 'Office', 'test-key', true)).rejects.toThrow('משויך לסוכן אחר');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });
});