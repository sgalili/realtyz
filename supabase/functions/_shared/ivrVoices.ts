export const IVR_MODEL_ID = 'eleven_v3';
// Public Hebrew Voice Library entries verified with the provider, never private clones.
export const IVR_DEFAULT_VOICES = [
  { id: 'itamar', label: 'איתמר · גבר ישראלי', voice_id: 'l7Q9rbdCC6j3J5dNlOOg', gender: 'male' },
  { id: 'nimrod', label: 'נמרוד · גבר ישראלי', voice_id: 'ZiofZHcEBTn5sRySe5h8', gender: 'male' },
  { id: 'zina', label: 'זינה · אישה בעברית', voice_id: 'Tbj9UQjXon5RB9MPEyc2', gender: 'female' },
] as const;

export function canUseIvrVoice(voiceId: string, workspaceId: string, custom: { voice_id: string; workspace_owner_id: string }[]) {
  return IVR_DEFAULT_VOICES.some(v => v.voice_id === voiceId) || custom.some(v => v.voice_id === voiceId && v.workspace_owner_id === workspaceId);
}