import { expect, it } from 'vitest';
import { canUseIvrVoice, IVR_MODEL_ID, IVR_DEFAULT_VOICES } from '../../supabase/functions/_shared/ivrVoices';
it('uses v3 only', () => expect(IVR_MODEL_ID).toBe('eleven_v3'));
it('keeps the existing provider voice as the first preset', () => {
  expect(IVR_DEFAULT_VOICES[0].voice_id).toBe('Tbj9UQjXon5RB9MPEyc2');
  expect(canUseIvrVoice('Tbj9UQjXon5RB9MPEyc2', 'owner', [])).toBe(true);
});
it('rejects custom voices from another workspace', () => {
  const voices = [{ voice_id: 'private', workspace_owner_id: 'owner' }];
  expect(canUseIvrVoice('private', 'other', voices)).toBe(false);
  expect(canUseIvrVoice('private', 'owner', voices)).toBe(true);
});