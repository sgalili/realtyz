import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedTablePanel, HorizontalTableScroll } from './horizontal-table-scroll';
import { tableOverflowState } from '@/lib/tableOverflow';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('horizontal overflow fades', () => {
  it('marks only the reachable off-screen edges without adding another scroll owner', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container } = render(<HorizontalTableScroll dir="rtl" style={{ direction: 'rtl' }}><table><tbody><tr><td>Summary</td></tr></tbody></table></HorizontalTableScroll>);
    const owner = container.querySelector<HTMLDivElement>('[data-table-scroll]');
    if (!owner) throw new Error('Missing scroll owner');
    Object.defineProperties(owner, { scrollWidth: { value: 1000 }, clientWidth: { value: 400 } });
    fireEvent.scroll(owner);
    expect(owner.dataset.overflowStart).toBe('false');
    expect(owner.dataset.overflowEnd).toBe('true');
    Object.defineProperty(owner, 'scrollLeft', { value: -300, writable: true, configurable: true });
    fireEvent.scroll(owner);
    expect(owner.dataset.overflowStart).toBe('true');
    expect(owner.dataset.overflowEnd).toBe('true');
    owner.scrollLeft = -600;
    fireEvent.scroll(owner);
    expect(owner.dataset.overflowStart).toBe('true');
    expect(owner.dataset.overflowEnd).toBe('false');
    expect(container.querySelectorAll('[data-table-scroll]')).toHaveLength(1);
  });
  it('uses the same edge calculation for page-owned tables', () => {
    expect(tableOverflowState({ scrollLeft: -200, scrollWidth: 900, clientWidth: 400, rtl: true })).toMatchObject({ start: true, end: true });
  });
});

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
    fireEvent.wheel(panel, { deltaX: 120 });
    expect(owner.scrollLeft).toBe(100);
    fireEvent.wheel(panel, { deltaY: 120 });
    expect(owner.scrollTop).toBe(120);
    fireEvent.wheel(row, { deltaY: 100, shiftKey: true });
    expect(owner.scrollLeft).toBe(200);
  });
});