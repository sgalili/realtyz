export type TypewriterPhase = 'typing' | 'holding' | 'deleting';

export interface TypewriterState {
  messageIndex: number;
  characterCount: number;
  phase: TypewriterPhase;
}

export const INITIAL_TYPEWRITER_STATE: TypewriterState = {
  messageIndex: 0,
  characterCount: 0,
  phase: 'typing',
};

export function advanceTypewriter(state: TypewriterState, messages: readonly string[]): TypewriterState {
  if (messages.length === 0) return INITIAL_TYPEWRITER_STATE;
  const messageIndex = state.messageIndex % messages.length;
  const messageLength = messages[messageIndex]?.length ?? 0;

  if (state.phase === 'typing') {
    return state.characterCount < messageLength
      ? { ...state, messageIndex, characterCount: state.characterCount + 1 }
      : { ...state, messageIndex, phase: 'holding' };
  }

  if (state.phase === 'holding') {
    return { ...state, messageIndex, phase: 'deleting' };
  }

  if (state.characterCount > 0) {
    return { ...state, messageIndex, characterCount: state.characterCount - 1 };
  }

  return {
    messageIndex: (messageIndex + 1) % messages.length,
    characterCount: 0,
    phase: 'typing',
  };
}

export function typewriterDelay(state: TypewriterState): number {
  if (state.phase === 'holding') return 1800;
  if (state.phase === 'deleting') return state.characterCount === 0 ? 350 : 24;
  return 44;
}
