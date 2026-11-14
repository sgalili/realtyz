import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedTablePanel, HorizontalTableScroll } from './horizontal-table-scroll';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('independent expanded listing scrolling', () => {
  it('lets a new summary gesture scroll immediately after touching expanded details', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container } = render(<HorizontalTableScroll><table><tbody><tr aria-expanded><td>Summary</td></tr><tr><td><FixedTablePanel>Details</FixedTablePanel></td></tr></tbody></table></HorizontalTableScroll>);
    const owner = container.querySelector<HTMLDivElement>('[data-table-scroll]');
    const row = container.querySelector('tr');
    const panel = container.querySelector<HTMLElement>('[data-table-fixed-panel]');
    if (!owner || !row || !panel) throw new Error('Missing table elements');
    fireEvent.touchStart(panel, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 150, clientY: 100 }] });
    fireEvent.touchEnd(panel, { touches: [] });
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 100 }] });
    owner.scrollLeft = 80;
    fireEvent.scroll(owner);
    expect(owner.scrollLeft).toBe(80);
    fireEvent.touchMove(row, { touches: [{ clientX: 150, clientY: 100 }] });
    owner.scrollLeft = 120;
    fireEvent.scroll(owner);
    expect(owner.scrollLeft).toBe(120);
  });
  it('scrolls open summary rows while counter-scrolling bodies and keeping vertical movement', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container } = render(<HorizontalTableScroll><table><tbody><tr data-row-id="a" aria-expanded><td>A</td></tr><tr><td><FixedTablePanel>Details</FixedTablePanel></td></tr></tbody></table></HorizontalTableScroll>);
    const owner = container.querySelector<HTMLDivElement>('[data-table-scroll]');
    if (!owner) throw new Error('Missing scroll owner');
    Object.defineProperties(owner, { scrollWidth: { value: 1000 }, clientWidth: { value: 400 }, scrollHeight: { value: 1000 }, clientHeight: { value: 400 } });
    const row = container.querySelector('tr');
    const panel = container.querySelector<HTMLElement>('[data-table-fixed-panel]');
    if (!row || !panel) throw new Error('Missing row or body');
    fireEvent.wheel(row, { deltaX: 100 });
    expect(owner.scrollLeft).toBe(100);
    expect(owner.style.getPropertyValue('--table-scroll-x')).toBe('100px');
    fireEvent.wheel(panel, { deltaX: 120 });
    expect(owner.scrollLeft).toBe(100);
    fireEvent.wheel(panel, { deltaY: 120 });
    expect(owner.scrollTop).toBe(120);
    fireEvent.wheel(row, { deltaY: 100, shiftKey: true });
    expect(owner.scrollLeft).toBe(200);
  });
});