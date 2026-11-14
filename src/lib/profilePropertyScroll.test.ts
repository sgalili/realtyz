import { afterEach, expect, it, vi } from 'vitest';
import { scrollProfileProperties } from './profilePropertyScroll';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('brings profile controls to the shell top without changing selected columns', () => {
  document.body.innerHTML = '<main class="realtyz-main-surface"><div id="controls"></div><div data-table-scroll><table><thead></thead><tbody><tr id="row"></tr></tbody></table></div></main>';
  const owner = document.querySelector<HTMLElement>('main');
  const controls = document.getElementById('controls');
  const table = document.querySelector<HTMLElement>('[data-table-scroll]');
  const head = document.querySelector('thead');
  const row = document.getElementById('row');
  if (!owner || !controls || !table || !head || !row) throw new Error('Missing fixture');
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
  vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue({ top: 450 } as DOMRect);
  vi.spyOn(head, 'getBoundingClientRect').mockReturnValue({ bottom: 510 } as DOMRect);
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 620 } as DOMRect);
  owner.scrollTop = 50;
  table.scrollLeft = -180;
  table.scrollTop = 40;
  owner.scrollTo = vi.fn();
  table.scrollTo = vi.fn();
  scrollProfileProperties(controls, row);
  expect(owner.scrollTo).toHaveBeenCalledWith({ top: 410, behavior: 'smooth' });
  expect(table.scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'smooth' });
  expect(table.scrollLeft).toBe(-180);
});