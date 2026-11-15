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

// Typing is deliberately relaxed (15% slower than the original 44ms per
// character) so the sentence stays readable; deletion keeps its original pace.
const TYPE_MS = 52;
const DELETE_MS = 24;
const DELETE_END_MS = 350;
const HOLD_MS = 1800;
// A comma, period or exclamation mark gets a full second of rest before the
// rest of the sentence is written.
const PUNCTUATION_MS = 1000;
const PAUSE_AFTER = new Set([',', '.', '!']);

export function typewriterDelay(state: TypewriterState, messages: readonly string[]): number {
  if (state.phase === 'holding') return HOLD_MS;
  if (state.phase === 'deleting') return state.characterCount === 0 ? DELETE_END_MS : DELETE_MS;

  const message = messages[state.messageIndex] ?? '';
  const lastTyped = message[state.characterCount - 1];
  const moreToType = state.characterCount < message.length;
  if (moreToType && lastTyped !== undefined && PAUSE_AFTER.has(lastTyped)) return PUNCTUATION_MS;

  return TYPE_MS;
}
