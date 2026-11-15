/**
 * Shared Rita keyboard contract: Enter inserts a new line, while
 * Command (Mac) or Control (PC) + Enter sends the message.
 */

export type RitaChatKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey?: boolean;
  /** True while an IME candidate is still being composed. */
  isComposing: boolean;
};

export type RitaChatKeyAction = 'send' | 'newline' | 'ignore';

export function ritaChatKeyAction(event: RitaChatKeyEvent): RitaChatKeyAction {
  if (event.key !== 'Enter' || event.isComposing) return 'ignore';
  return event.metaKey || event.ctrlKey ? 'send' : 'newline';
}
