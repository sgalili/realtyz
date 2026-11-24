import { expect, it } from 'vitest';
import { canUseIvrVoice, IVR_MODEL_ID, IVR_DEFAULT_VOICES } from '../../supabase/functions/_shared/ivrVoices';
it('uses v3 only', () => expect(IVR_MODEL_ID).toBe('eleven_v3'));
it('keeps the existing provider voice as the first preset', () => {
  expect(IVR_DEFAULT_VOICES[0].voice_id).toBe('t1FxSQNdBrLMfytJMHmg');
  expect(canUseIvrVoice('t1FxSQNdBrLMfytJMHmg', 'owner', [])).toBe(true);
});
it('rejects custom voices from another workspace', () => {
  const voices = [{ voice_id: 'private', workspace_owner_id: 'owner' }];
  expect(canUseIvrVoice('private', 'other', voices)).toBe(false);
  expect(canUseIvrVoice('private', 'owner', voices)).toBe(true);
});