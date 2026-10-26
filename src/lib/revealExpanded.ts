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
  let movedH = false;
  for (let el = card.parentElement; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollLeft !== 0) {
      movedH = true;
      el.scrollTo({ left: 0, behavior: reducedH ? 'auto' : 'smooth' });
    }
  }
  const vertical = () => {
  // Sticky table headings cover the top of the card; keep it fully below them.
  const head = card.closest('table')?.querySelector('thead');
  const headBottom = head ? Math.max(0, head.getBoundingClientRect().bottom) : 0;
  card.style.scrollMarginTop = head ? `${Math.ceil(head.getBoundingClientRect().height) + 8}px` : '';
  const rect = card.getBoundingClientRect();
  if (rect.top >= headBottom && rect.bottom <= window.innerHeight) return;
  card.scrollIntoView({ behavior: reducedH ? 'auto' : 'smooth', block: rect.height > window.innerHeight * 0.85 ? 'start' : 'nearest', inline: 'nearest' });
  };
  // Let the horizontal return finish first so the two smooth scrolls don't cancel each other.
  if (movedH && !reducedH) window.setTimeout(vertical, 350); else vertical();
}
