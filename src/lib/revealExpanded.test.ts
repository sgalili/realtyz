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
  it('anchors a card below its own scrolling container instead of moving the document', () => {
    document.body.innerHTML = '<main style="overflow-y:auto"><article><h2>Property title</h2><div id="content">Details</div></article></main>';
    const owner = document.querySelector('main');
    const card = document.querySelector('article');
    if (!owner || !card) throw new Error('Missing card fixture');
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ top: 330 } as DOMRect);
    owner.scrollTop = 120;
    owner.scrollTo = vi.fn();
    revealExpanded(document.getElementById('content'));
    expect(owner.scrollTo).toHaveBeenCalledWith({ top: 352, behavior: 'smooth' });
  });
});