export const EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer';

export function openExternal(url: string | null | undefined): void {
  if (!url) return;
  window.open(url, '_blank', EXTERNAL_WINDOW_FEATURES);
}
