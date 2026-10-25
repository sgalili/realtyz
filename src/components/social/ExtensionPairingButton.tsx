import { CloudGroupConnection } from './CloudGroupConnection';

/** Legacy entry point now opens the shared cloud connection. */
export function ExtensionPairingButton({ className }: { className?: string }) {
  return <div className={className}><CloudGroupConnection onRefresh={() => {}} /></div>;
}
export default ExtensionPairingButton;
