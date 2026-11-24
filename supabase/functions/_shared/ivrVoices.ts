// Rita's cloned voice is the platform-wide default for calls, IVR and voice messages.
export const RITA_DEFAULT_VOICE_ID = 't1FxSQNdBrLMfytJMHmg';
export const IVR_MODEL_ID = 'eleven_v3';
export const IVR_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.9, style: 0.35, use_speaker_boost: true } as const;
// Rita's platform clone first, then public Hebrew Voice Library entries.
export const IVR_DEFAULT_VOICES = [
  { id: 'rita', label: 'ריטה', voice_id: RITA_DEFAULT_VOICE_ID, gender: 'female' },
  { id: 'itamar', label: 'איתמר', voice_id: 'l7Q9rbdCC6j3J5dNlOOg', gender: 'male' },
  { id: 'nimrod', label: 'נמרוד', voice_id: 'ZiofZHcEBTn5sRySe5h8', gender: 'male' },
] as const;

export function canUseIvrVoice(voiceId: string, workspaceId: string, custom: { voice_id: string; workspace_owner_id: string }[]) {
  return IVR_DEFAULT_VOICES.some(v => v.voice_id === voiceId) || custom.some(v => v.voice_id === voiceId && v.workspace_owner_id === workspaceId);
}