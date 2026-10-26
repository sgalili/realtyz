import { toast as base } from 'sonner';
import { personalCommand } from './personalLanguage';
/** Translate authored commands at emission; preserve non-string custom toast content. */
const wrap = <T extends (...args: any[]) => any>(fn: T): T => ((...args: Parameters<T>) => {
  if (typeof args[0] === 'string') args[0] = personalCommand(args[0]);
  return fn(...args);
}) as T;
export const toast = Object.assign(wrap(base), base, {
  success: wrap(base.success), error: wrap(base.error), info: wrap(base.info), warning: wrap(base.warning), message: wrap(base.message), loading: wrap(base.loading),
});