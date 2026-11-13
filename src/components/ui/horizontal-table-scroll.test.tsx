import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HorizontalTableScroll } from './horizontal-table-scroll';

afterEach(cleanup);
describe('expanded listing scroll lock', () => {
  it('blocks horizontal movement while any row is open, retains vertical movement and restores on last close', async () => {
    const content = (a: boolean, b: boolean) => <HorizontalTableScroll><table><tbody><tr data-row-id="a" aria-expanded={a}><td>A</td></tr><tr data-row-id="b" aria-expanded={b}><td>B</td></tr></tbody></table></HorizontalTableScroll>;
    const { container, rerender } = render(content(false, false));
    const owner = container.querySelector<HTMLDivElement>('[data-table-scroll]');
    if (!owner) throw new Error('Missing scroll owner');
    Object.defineProperties(owner, { scrollWidth: { value: 1000 }, clientWidth: { value: 400 }, scrollHeight: { value: 1000 }, clientHeight: { value: 400 } });
    fireEvent.wheel(owner, { deltaX: 100 });
    expect(owner.scrollLeft).toBe(100);
    rerender(content(true, true));
    await waitFor(() => expect(owner.hasAttribute('data-horizontal-locked')).toBe(true));
    expect(owner.scrollLeft).toBe(0);
    fireEvent.wheel(owner, { deltaX: 120 });
    expect(owner.scrollLeft).toBe(0);
    fireEvent.wheel(owner, { deltaY: 120 });
    expect(owner.scrollTop).toBe(120);
    rerender(content(false, true));
    await waitFor(() => expect(owner.style.overflowX).toBe('hidden'));
    fireEvent.wheel(owner, { deltaY: 120, shiftKey: true });
    expect(owner.scrollLeft).toBe(0);
    rerender(content(false, false));
    await waitFor(() => expect(owner.hasAttribute('data-horizontal-locked')).toBe(false));
    fireEvent.wheel(owner, { deltaX: 100 });
    expect(owner.scrollLeft).toBe(100);
  });
});