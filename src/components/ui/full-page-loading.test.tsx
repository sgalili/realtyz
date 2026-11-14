import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullPageLoading, FullPageLoadingProvider } from './full-page-loading';
vi.mock('./toraff-loader', () => ({ ToraffLoader: () => <span>video animation</span> }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('persistent page loading overlay', () => {
  it('does not dismiss a completed page before two seconds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(100));
    view.rerender(<FullPageLoadingProvider><div>loaded page</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(1_899));
    expect(screen.getByRole('status', { name: 'טעינת עמוד' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(51));
    expect(screen.getByRole('status', { name: 'טעינת עמוד' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_499));
    expect(screen.getByRole('status', { name: 'טעינת עמוד' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status', { name: 'טעינת עמוד' })).toBeNull();
    expect(screen.getByText('loaded page')).toBeVisible();
  });
  it('keeps the overlay while a slower request remains pending', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole('status', { name: 'טעינת עמוד' })).toBeInTheDocument();
    view.rerender(<FullPageLoadingProvider><div>done</div></FullPageLoadingProvider>);
    act(() => vi.runOnlyPendingTimers());
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.queryByRole('status', { name: 'טעינת עמוד' })).toBeNull();
  });
  it('cancels dismissal if another page starts loading during the fade', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = render(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    view.rerender(<FullPageLoadingProvider><div>done</div></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(2_050));
    view.rerender(<FullPageLoadingProvider><FullPageLoading /></FullPageLoadingProvider>);
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('status', { name: 'טעינת עמוד' })).toBeInTheDocument();
  });
});