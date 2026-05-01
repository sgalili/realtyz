/**
 * Demo Mode has been removed — production-only mode.
 * This filter previously suppressed sonner toasts while demo was active.
 * It is now a no-op kept only so existing imports keep working.
 */
export const installDemoToastFilter = () => {
  /* no-op */
};
