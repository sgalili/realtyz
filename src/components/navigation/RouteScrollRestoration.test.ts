import { afterEach, describe, expect, it } from 'vitest';
import { readScrollOwners, restoreScrollOwners } from './RouteScrollRestoration';

afterEach(() => { document.body.innerHTML = ''; });
describe('previous-page scroll owners', () => {
  it('restores both main page and property table coordinates', () => {
    document.body.innerHTML = '<main class="realtyz-main-surface"><div data-table-scroll></div></main>';
    const main = document.querySelector<HTMLElement>('main');
    const table = document.querySelector<HTMLElement>('[data-table-scroll]');
    if (!main || !table) throw new Error('Missing owners');
    main.scrollTop = 400;
    table.scrollTop = 780;
    table.scrollLeft = -240;
    const saved = readScrollOwners();
    main.scrollTop = 0;
    table.scrollTop = 0;
    table.scrollLeft = 0;
    restoreScrollOwners(saved);
    expect(main.scrollTop).toBe(400);
    expect(table.scrollTop).toBe(780);
    expect(table.scrollLeft).toBe(-240);
  });
});