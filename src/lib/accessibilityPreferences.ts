export const ACCESSIBILITY_KEY = 'toraff:accessibility:v1';
export const ACCESSIBILITY_EVENT = 'toraff:accessibility-change';
export type AccessibilityPreferences = {
  textScale: number;
  contrast: boolean;
  links: boolean;
  motion: boolean;
  readable: boolean;
  keyboard: boolean;
};
export const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
  textScale: 1, contrast: false, links: false, motion: false, readable: false, keyboard: false,
};
export function normalizeAccessibility(value: unknown): AccessibilityPreferences {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    textScale: typeof source.textScale === 'number' && Number.isFinite(source.textScale)
      ? Math.max(1, Math.min(2, source.textScale)) : 1,
    contrast: source.contrast === true, links: source.links === true,
    motion: source.motion === true, readable: source.readable === true, keyboard: source.keyboard === true,
  };
}
export function readAccessibility(): AccessibilityPreferences {
  try { return normalizeAccessibility(JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY) ?? '{}')); }
  catch { return { ...DEFAULT_ACCESSIBILITY }; }
}
export function saveAccessibility(value: AccessibilityPreferences) {
  const preferences = normalizeAccessibility(value);
  try { localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(preferences)); } catch { /* Works without storage. */ }
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_EVENT, { detail: preferences }));
}