import { expect, it } from 'vitest';
import { canUseIvrVoice, IVR_MODEL_ID } from '../../supabase/functions/_shared/ivrVoices';
it('uses v3 only', () => expect(IVR_MODEL_ID).toBe('eleven_v3'));
it('rejects custom voices from another workspace', () => {
  const voices = [{ voice_id: 'private', workspace_owner_id: 'owner' }];
  expect(canUseIvrVoice('private', 'other', voices)).toBe(false);
  expect(canUseIvrVoice('private', 'owner', voices)).toBe(true);
});