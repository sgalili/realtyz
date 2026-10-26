import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealExpanded } from './revealExpanded';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('expanded property table scrolling', () => {
  function setup(summaryTop: number, scrollTop: number) {
    document.body.innerHTML = '<div data-table-scroll><table><thead><tr><th>Heading</th></tr></thead><tbody><tr data-row-id="property"><td>Summary</td></tr><tr><td><div id="content">Details</div></td></tr></tbody></table></div>';
    const scroll = document.querySelector<HTMLElement>('[data-table-scroll]');
    const summary = document.querySelector('[data-row-id]');
    const head = document.querySelector('thead');
    if (!scroll || !summary || !head) throw new Error('Missing table fixture');
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(head, 'getBoundingClientRect').mockReturnValue({ bottom: 150 } as DOMRect);
    vi.spyOn(summary, 'getBoundingClientRect').mockReturnValue({ top: summaryTop } as DOMRect);
    scroll.scrollTop = scrollTop;
    const scrollTo = vi.fn();
    scroll.scrollTo = scrollTo;
    return scrollTo;
  }

  it('aligns the summary above the owner card below the pinned heading', () => {
    const scrollTo = setup(340, 120);
    revealExpanded(document.getElementById('content'));
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 302, behavior: 'smooth' });
  });

  it('brings a hidden summary back below the heading rather than aligning details', () => {
    const scrollTo = setup(112, 64);
    revealExpanded(document.getElementById('content'));
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 18, behavior: 'smooth' });
  });

  it('clamps the first row at the start of the table', () => {
    const scrollTo = setup(150, 0);
    revealExpanded(document.getElementById('content'));
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'smooth' });
  });
});