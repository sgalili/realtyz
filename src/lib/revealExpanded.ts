/**
 * Smoothly brings a just-expanded card into view so none of its content stays
 * clipped off-screen (works inside nested scroll areas such as tables/dialogs).
 */
export function revealExpanded(content: Element | null) {
  if (!content || typeof window === 'undefined') return;
  const card = (content.parentElement ?? content) as HTMLElement;
  const rect = card.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: rect.height > window.innerHeight * 0.85 ? 'start' : 'nearest', inline: 'nearest' });
}
