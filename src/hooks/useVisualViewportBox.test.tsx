import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewportBox } from './useVisualViewportBox';

const originalViewport = window.visualViewport;
const originalHeight = window.innerHeight;
const originalWidth = window.innerWidth;

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  vi.restoreAllMocks();
});

describe('useVisualViewportBox', () => {
  it('keeps the chat inside the resized visible viewport above a mobile keyboard', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 900, offsetTop: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const { result } = renderHook(() => useVisualViewportBox(true, false));
    await waitFor(() => expect(result.current).toMatchObject({ top: 0, height: 900 }));

    viewport.height = 500;
    viewport.offsetTop = 100;
    act(() => { viewport.dispatchEvent(new Event('resize')); });
    await waitFor(() => expect(result.current).toMatchObject({ top: 100, height: 500, maxHeight: 500, bottom: 'auto' }));
  });

  it('preserves the expanded chat inset within the visible viewport', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 100 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 442 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const { result } = renderHook(() => useVisualViewportBox(true, true));
    await waitFor(() => expect(result.current).toMatchObject({ top: 108, height: 484 }));
  });
});
