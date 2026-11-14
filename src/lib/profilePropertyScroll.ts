export function scrollProfileProperties(controls: HTMLElement | null, row?: HTMLElement | null) {
  if (!controls) return;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const owner = controls.closest<HTMLElement>('.realtyz-main-surface');
  if (owner) {
    owner.scrollTo({ top: Math.max(0, owner.scrollTop + controls.getBoundingClientRect().top - owner.getBoundingClientRect().top), behavior });
  } else controls.scrollIntoView({ block: 'start', behavior });
  if (row) {
    const table = row.closest<HTMLElement>('[data-table-scroll]');
    const head = table?.querySelector('thead');
    if (table && head) table.scrollTo({ top: Math.max(0, table.scrollTop + row.getBoundingClientRect().top - head.getBoundingClientRect().bottom), behavior });
  }
}