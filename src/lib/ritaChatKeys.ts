/**
 * ritaChatKeys
 * ------------
 * Keyboard contract for the visitor Rita chat input: a plain Enter inserts a
 * new line, while Command + Enter (Mac) or Control + Enter (PC) sends.
 */

export type RitaChatKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True while an IME candidate is still being composed. */
  isComposing: boolean;
};

export type RitaChatKeyAction = 'send' | 'newline' | 'ignore';

export function ritaChatKeyAction(event: RitaChatKeyEvent): RitaChatKeyAction {
  if (event.key !== 'Enter' || event.isComposing) return 'ignore';
  return event.metaKey || event.ctrlKey ? 'send' : 'newline';
}
