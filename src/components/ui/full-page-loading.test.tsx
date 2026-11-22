import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullPageLoading, FullPageLoadingProvider, PageLoadingRegion } from './full-page-loading';
vi.mock('./toraff-loader', () => ({ ToraffLoader: () => <span>video animation</span> }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const overlay = () => screen.queryByRole('status', { name: 'טעינת עמוד' });
describe('persistent page loading overlay', () => {
  it('never registers a guest splash even when a nested page is still loading', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    render(<FullPageLoadingProvider enabled={false}><FullPageLoadingProvider><PageLoadingRegion><FullPageLoading /></PageLoadingRegion></FullPageLoadingProvider></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(10_000));
    expect(overlay()).toBeNull();
  });
  it('immediately clears an existing splash on a suppressed navigation and can load again later', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(overlay()).not.toBeNull();
    view.rerender(<FullPageLoadingProvider enabled={false}><FullPageLoading /></FullPageLoadingProvider>);
    expect(overlay()).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(overlay()).toBeNull();
    view.rerender(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(overlay()).not.toBeNull();
  });
  it('isolates homepage result loading from the enclosing shell provider', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    render(<FullPageLoadingProvider>
      <PageLoadingRegion as="main" aria-label="shell">
        <FullPageLoadingProvider>
          <header>homepage controls</header>
          <PageLoadingRegion as="main" aria-label="results"><FullPageLoading /></PageLoadingRegion>
        </FullPageLoadingProvider>
      </PageLoadingRegion>
    </FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getAllByRole('status', { name: 'טעינת עמוד' })).toHaveLength(1);
    expect(screen.getByRole('main', { name: 'shell' })).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('main', { name: 'shell' }).firstElementChild).not.toHaveAttribute('inert');
    expect(screen.getByRole('main', { name: 'results' })).toHaveAttribute('aria-busy', 'true');
  });
  it('never shows the video loader for pages that load within one second', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(900));
    expect(overlay()).toBeNull();
    view.rerender(<FullPageLoadingProvider><div>loaded page</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(5_000));
    expect(overlay()).toBeNull();
    expect(screen.getByText('loaded page')).toBeVisible();
  });
  it('shows the loader only after one second and holds the two second minimum', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(999));
    expect(overlay()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(overlay()).toBeInTheDocument();
    view.rerender(<FullPageLoadingProvider><div>loaded page</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_049));
    expect(overlay()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(overlay()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_499));
    expect(overlay()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(overlay()).toBeNull();
    expect(screen.getByText('loaded page')).toBeVisible();
  });
  it('keeps the loader while a slower request remains pending', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(overlay()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(overlay()).toBeInTheDocument();
    view.rerender(<FullPageLoadingProvider><div>done</div></FullPageLoadingProvider>);
    act(() => vi.runOnlyPendingTimers());
    act(() => vi.advanceTimersByTime(1_500));
    expect(overlay()).toBeNull();
  });
  it('cancels dismissal if another page starts loading during the fade', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    view.rerender(<FullPageLoadingProvider><div>done</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_050));
    view.rerender(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(2_000));
    expect(overlay()).toBeInTheDocument();
  });
  it('skips the loader for a fast load that follows a completed slow one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    view.rerender(<FullPageLoadingProvider><div>done</div></FullPageLoadingProvider>);
    act(() => vi.runOnlyPendingTimers());
    act(() => vi.advanceTimersByTime(1_500));
    expect(overlay()).toBeNull();
    view.rerender(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(500));
    expect(overlay()).toBeNull();
    view.rerender(<FullPageLoadingProvider><div>second page</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(5_000));
    expect(overlay()).toBeNull();
    expect(screen.getByText('second page')).toBeVisible();
  });
  it('keeps the loaded header and hero outside the hidden and inert loading content', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    render(<FullPageLoadingProvider>
      <header>main website header</header>
      <div data-testid="hero">blue hero title</div>
      <PageLoadingRegion as="main"><FullPageLoading /><div data-testid="page-body">loading page body</div></PageLoadingRegion>
    </FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(overlay()).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('banner')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('hero')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('hero')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('page-body').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('page-body').parentElement).toHaveAttribute('inert');
  });
});
