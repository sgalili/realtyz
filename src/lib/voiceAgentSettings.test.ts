import { describe, expect, it, vi } from 'vitest';
import { boundedVoiceRequest, DEFAULT_AGENT_VOICE, voiceAgentConversation, voiceAgentSettingsSchema } from './voiceAgentSettings';

const settings = { availability: 'away' as const, elevenlabs_voice_id: DEFAULT_AGENT_VOICE, language: 'he' as const, elevenlabs_phone_number: '', greeting: '' };
describe('voice agent configuration', () => {
  it('keeps Hebrew and the saved voice in the provider payload', () => {
    const payload = voiceAgentConversation(settings, 'משרד', '');
    expect(payload.agent.language).toBe('he');
    expect(payload.tts.voice_id).toBe('t1FxSQNdBrLMfytJMHmg');
    expect(payload.tts.model_id).toBe('eleven_v3_conversational');
  });
  it('does not let a persona replace the selected language or greeting', () => {
    const payload = voiceAgentConversation({ ...settings, language: 'en', greeting: 'Good morning' }, 'Office', '');
    expect(payload.agent.language).toBe('en');
    expect(payload.agent.first_message).toBe('Good morning');
  });
  it('rejects caller-supplied ownership and provider IDs', () => {
    expect(voiceAgentSettingsSchema.safeParse({ ...settings, user_id: 'another-account' }).success).toBe(false);
    expect(voiceAgentSettingsSchema.safeParse({ ...settings, elevenlabs_agent_id: 'another-agent' }).success).toBe(false);
  });
  it('accepts empty or international phone numbers, not an arbitrary phone ID', () => {
    expect(voiceAgentSettingsSchema.safeParse({ ...settings, elevenlabs_phone_number: '+972500000034' }).success).toBe(true);
    expect(voiceAgentSettingsSchema.safeParse({ ...settings, elevenlabs_phone_number: 'phone_123' }).success).toBe(false);
  });
  it('settles a stalled request and clears its timer', async () => {
    vi.useFakeTimers();
    const result = boundedVoiceRequest(new Promise(() => {}), 20000);
    const assertion = expect(result).rejects.toThrow('הבקשה נמשכת');
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});