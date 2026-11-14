import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Increase each element's original size once, leaving timestamp tracks untouched. */
export function ChatTypography({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const apply = () => {
      const elements = Array.from(container.querySelectorAll<HTMLElement>('*')).filter(element => !element.closest('svg, [data-chat-timestamp], time') && !element.dataset.chatOriginalSize);
      const sizes = elements.map(element => [element, getComputedStyle(element).fontSize] as const);
      sizes.forEach(([element, size]) => { element.dataset.chatOriginalSize = size; element.style.fontSize = `${parseFloat(size) + 2}px`; });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className="flex h-full min-h-0 flex-col">{children}</div>;
}