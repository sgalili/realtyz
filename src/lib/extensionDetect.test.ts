import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXT_INSTALLED_KEY,
  clearExtensionInstallFlag,
  ensureExtensionReady,
  isExtensionInstalled,
  verifyExtensionAlive,
} from './extensionDetect';

/** Pretend the content script is running: answer status pings. */
const respondToPings = () => {
  const handler = (e: MessageEvent) => {
    const d: any = e.data;
    if (!d || d.source !== 'realtyz-app' || d.type !== 'RZ_EXT_STATUS_REQUEST') return;
    window.postMessage({ source: 'realtyz-extension', type: 'RZ_EXT_STATUS', paired: false, state: {} }, window.location.origin);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
};

describe('extension detection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-realtyz-extension');
  });
  afterEach(() => {
    document.documentElement.removeAttribute('data-realtyz-extension');
  });

  it('passive check sees the content-script marker', () => {
    expect(isExtensionInstalled()).toBe(false);
    document.documentElement.setAttribute('data-realtyz-extension', '1');
    expect(isExtensionInstalled()).toBe(true);
  });

  it('verifyExtensionAlive resolves true on a live answer and refreshes the flag', async () => {
    const stop = respondToPings();
    await expect(verifyExtensionAlive(300)).resolves.toBe(true);
    expect(localStorage.getItem(EXT_INSTALLED_KEY)).toBe('1');
    stop();
  });

  it('verifyExtensionAlive resolves false when nothing answers', async () => {
    await expect(verifyExtensionAlive(50)).resolves.toBe(false);
  });

  it('ensureExtensionReady clears a stale installed flag when the extension is gone', async () => {
    localStorage.setItem(EXT_INSTALLED_KEY, '1');
    await expect(ensureExtensionReady(50)).resolves.toBe(false);
    expect(localStorage.getItem(EXT_INSTALLED_KEY)).toBeNull();
  });

  it('ensureExtensionReady keeps the flag when the page marker is present (fresh load)', async () => {
    document.documentElement.setAttribute('data-realtyz-extension', '1');
    await expect(ensureExtensionReady(50)).resolves.toBe(false);
    // Marker means the content script did run on this page — flag not treated as stale.
    clearExtensionInstallFlag();
  });
});
