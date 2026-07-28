import { toast } from 'sonner';

/**
 * Global toast policy.
 *
 * The product only surfaces toasts for critical / unrecoverable failures.
 * Every "nice to know" notification (success, info, warning, loading,
 * neutral message) is suppressed application-wide so the UI stays quiet.
 *
 * This is installed once at boot and patches the shared sonner `toast`
 * object, so all existing call sites keep compiling and simply become no-ops.
 */
const noop = () => '' as unknown as string | number;

export const installDemoToastFilter = () => {
  try {
    const t = toast as unknown as Record<string, unknown>;
    t.success = noop;
    t.info = noop;
    t.warning = noop;
    t.message = noop;
    t.loading = noop;
  } catch {
    /* never let notification policy break boot */
  }
};
