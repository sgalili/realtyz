import { CloudGroupConnection } from './CloudGroupConnection';
export { isExtensionInstalled } from '@/lib/extensionDetect';

/** Legacy entry point now opens the shared cloud connection. */
export function ExtensionDownloadButton({ className }: { className?: string }) {
  return <div className={className}><CloudGroupConnection onRefresh={() => {}} /></div>;
}
export default ExtensionDownloadButton;
