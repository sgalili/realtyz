import { expect, it } from 'vitest';
import { canUseIvrVoice, IVR_MODEL_ID, IVR_DEFAULT_VOICES } from '../../supabase/functions/_shared/ivrVoices';
it('uses v3 only', () => expect(IVR_MODEL_ID).toBe('eleven_v3'));
it('does not use the removed Zina default', () => expect(IVR_DEFAULT_VOICES.some(voice => String(voice.voice_id) === 'Tbj9UQjXon5RB9MPEyc2')).toBe(false));
it('rejects custom voices from another workspace', () => {
  const voices = [{ voice_id: 'private', workspace_owner_id: 'owner' }];
  expect(canUseIvrVoice('private', 'other', voices)).toBe(false);
  expect(canUseIvrVoice('private', 'owner', voices)).toBe(true);
});