import { useEffect } from 'react';
import { Accessibility } from 'accessibility';
import { ACCESSIBILITY_EVENT, ACCESSIBILITY_KEY, readAccessibility, type AccessibilityPreferences } from '@/lib/accessibilityPreferences';

/** Global effects outlive workspace and route changes; the MIT engine supplies media pausing. */
export function AccessibilityEffects() {
  useEffect(() => {
    const engine = new Accessibility({
      suppressDomInjection: true, suppressCssInjection: true,
      icon: { useEmojis: true, fontFaceSrc: [] }, session: { persistent: false },
    });
    const root = document.documentElement;
    const originalLang = root.lang;
    root.lang = 'he';
    let preferences = readAccessibility();
    let motionEnabled = false;
    const measured = new Set<HTMLElement>();
    const measure = (container: Element) => {
      if (preferences.textScale === 1) return;
      root.style.setProperty('--a11y-scale', '1');
      const elements = [container, ...container.querySelectorAll('*')];
      const sizes: Array<[HTMLElement, string]> = [];
      elements.forEach(element => {
        if (!(element instanceof HTMLElement) || measured.has(element)
          || ['STYLE', 'SCRIPT', 'IMG', 'VIDEO', 'CANVAS'].includes(element.tagName)
          || element.closest('th')) return; // table headings scale via CSS zoom so re-rendered sort/drag labels never miss it
        // Snapshot px/rem/computed sizes once, then scale all existing and lazy-loaded screens.
        sizes.push([element, getComputedStyle(element).fontSize]);
      });
      sizes.forEach(([element, size]) => {
        element.style.setProperty('--a11y-base-size', size);
        element.dataset.a11yText = '';
        measured.add(element);
      });
      root.style.setProperty('--a11y-scale', String(preferences.textScale));
    };
    const apply = (next: AccessibilityPreferences) => {
      preferences = next;
      for (const key of ['contrast', 'links', 'motion', 'readable', 'keyboard'] as const) {
        root.toggleAttribute(`data-a11y-${key}`, next[key]);
      }
      root.style.setProperty('--a11y-scale', String(next.textScale));
      root.toggleAttribute('data-a11y-scaled', next.textScale > 1);
      if (next.textScale > 1) measure(document.body);
      else {
        measured.forEach(element => { element.style.removeProperty('--a11y-base-size'); delete element.dataset.a11yText; });
        measured.clear();
      }
      if (next.motion !== motionEnabled) {
        engine.menuInterface.disableAnimations(!next.motion);
        motionEnabled = next.motion;
      }
    };
    apply(preferences);
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element) {
          measure(node);
          if (preferences.motion) {
            const videos = [...node.querySelectorAll('video'), ...(node instanceof HTMLVideoElement ? [node] : [])];
            videos.forEach(video => video.pause());
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const changed = (event: Event) => apply((event as CustomEvent<AccessibilityPreferences>).detail);
    const storageChanged = (event: StorageEvent) => { if (event.key === ACCESSIBILITY_KEY) apply(readAccessibility()); };
    window.addEventListener(ACCESSIBILITY_EVENT, changed);
    window.addEventListener('storage', storageChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener(ACCESSIBILITY_EVENT, changed);
      window.removeEventListener('storage', storageChanged);
      if (motionEnabled) engine.menuInterface.disableAnimations(true);
      engine.destroy();
      measured.forEach(element => { element.style.removeProperty('--a11y-base-size'); delete element.dataset.a11yText; });
      ['contrast', 'links', 'motion', 'readable', 'keyboard'].forEach(key => root.removeAttribute(`data-a11y-${key}`));
      root.style.removeProperty('--a11y-scale');
      root.lang = originalLang;
    };
  }, []);
  return null;
}