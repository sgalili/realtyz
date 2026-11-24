import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Browser layout observers are not implemented by jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

// Components read the platform mode through React Query; tests default to the
// full marketplace unless a test file mocks this module itself.
vi.mock('@/hooks/usePlatformMode', () => ({
  usePlatformMode: () => ({ data: 'full_marketplace', isLoading: false }),
  useBrokersOnly: () => false,
}));
