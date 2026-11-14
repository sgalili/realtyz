// The exact package alias routes only public imports here; the original module
// remains untouched, including every non-loading icon and idle refresh action.
import * as Icons from 'lucide-react/dist/esm/lucide-react.js';
import type { LucideProps } from 'lucide-react';
import { ToraffLoader } from '@/components/ui/toraff-loader';
export * from 'lucide-react/dist/esm/lucide-react.js';

function LoadingIcon({ className, size, ...props }: LucideProps) {
  return <ToraffLoader size={size} className={className} id={props.id} role={props.role} aria-label={props['aria-label']} aria-hidden={props['aria-hidden']} />;
}
export { LoadingIcon as Loader, LoadingIcon as LoaderIcon, LoadingIcon as Loader2, LoadingIcon as Loader2Icon, LoadingIcon as LoaderCircle, LoadingIcon as LoaderCircleIcon, LoadingIcon as LoaderPinwheel, LoadingIcon as LoaderPinwheelIcon };

export function RefreshCw(props: LucideProps) {
  return props.className?.split(/\s+/).includes('animate-spin') ? <LoadingIcon {...props} /> : <Icons.RefreshCw {...props} />;
}
export { RefreshCw as RefreshCwIcon };