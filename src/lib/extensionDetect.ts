/**
 * extensionDetect — one source of truth for "is the Realtyz browser extension
 * present in this browser?".
 *
 * Two signals are combined:
 *  - Passive: the content script marks the page (`data-realtyz-extension`) and
 *    localStorage on every app page load. Fast, but can go stale when the
 *    extension is later removed or disabled while the flag survives.
 *  - Live: the content script always answers `RZ_EXT_STATUS_REQUEST` pings,
 *    even before pairing. A live answer is authoritative; a timeout means the
 *    extension is not running on this page.
 *
 * `ensureExtensionReady()` is the check every user-facing action should use:
 * it prefers a live answer, and clears the stale passive flag when the
 * extension does not respond, so the UI never claims a false "connected" state.
 */
import { readRunnerStatus } from "@/lib/extensionPairing";
import { readExtensionGroups } from "@/lib/extensionGroupBridge";

export const EXT_INSTALLED_KEY = "rz-ext-installed";
export const EXT_ZIP_PATH = "/realtyz-extension.zip";

/** Passive check: extension has touched this page before (or pushed groups). */
export const isExtensionInstalled = (): boolean => {
  try {
    if (document.documentElement.getAttribute("data-realtyz-extension") === "1") return true;
    if (localStorage.getItem(EXT_INSTALLED_KEY) === "1") return true;
  } catch { /* noop */ }
  return readExtensionGroups().length > 0;
};

export const markExtensionInstalled = () => {
  try { localStorage.setItem(EXT_INSTALLED_KEY, "1"); } catch { /* noop */ }
};

export const clearExtensionInstallFlag = () => {
  try { localStorage.removeItem(EXT_INSTALLED_KEY); } catch { /* noop */ }
};

/**
 * Live check: ping the content script. Resolves true when it answers
 * (paired or not), and refreshes the passive flag so later sync checks pass.
 */
export const verifyExtensionAlive = async (timeoutMs = 1500): Promise<boolean> => {
  const status = await readRunnerStatus(timeoutMs);
  if (status) {
    markExtensionInstalled();
    return true;
  }
  return false;
};

/**
 * Gate for extension-only actions (group search / join / sync). Never claims
 * the extension is present without a live answer; clears the stale flag when
 * it is not, so the UI switches to the install prompt instead of failing with
 * a generic timeout.
 */
export const ensureExtensionReady = async (timeoutMs = 1500): Promise<boolean> => {
  if (await verifyExtensionAlive(timeoutMs)) return true;
  if (!document.documentElement.hasAttribute("data-realtyz-extension")) clearExtensionInstallFlag();
  return false;
};

/** One-click download of the pre-packaged Chrome extension zip. */
export const downloadExtension = async (): Promise<boolean> => {
  try {
    const res = await fetch(EXT_ZIP_PATH);
    if (!res.ok) throw new Error(`הורדה נכשלה (${res.status})`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "realtyz-extension.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  } catch {
    return false;
  }
};
