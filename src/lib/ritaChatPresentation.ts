export const RITA_CHAT_GREETING = 'היי, אני ריטה. מה מביא אותך ל-TORAFF?';
export const RITA_CHAT_INPUT_MAX_HEIGHT = 128;

export function resizeRitaTextarea(textarea: HTMLTextAreaElement) {
  if (!textarea.value) {
    textarea.style.height = '';
    return;
  }
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, RITA_CHAT_INPUT_MAX_HEIGHT)}px`;
}
