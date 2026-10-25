/**
 * Smoothly brings a just-expanded card into view so none of its content stays
 * clipped off-screen (works inside nested scroll areas such as tables/dialogs).
 */
export function revealExpanded(content: Element | null) {
  if (!content || typeof window === 'undefined') return;
  const card = (content.parentElement ?? content) as HTMLElement;
  const reducedH = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Horizontally scrolled tables: always return to the table's starting edge
  // (scrollLeft 0 is the start edge in both LTR and RTL in modern browsers).
  for (let el = card.parentElement; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollLeft !== 0) {
      el.scrollTo({ left: 0, behavior: reducedH ? 'auto' : 'smooth' });
    }
  }
  const rect = card.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
  card.scrollIntoView({ behavior: reducedH ? 'auto' : 'smooth', block: rect.height > window.innerHeight * 0.85 ? 'start' : 'nearest', inline: 'nearest' });
}
