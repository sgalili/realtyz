import type { ReactNode } from 'react';
import { CloudGroupConnection } from './CloudGroupConnection';

/** Compatibility entry point: all group connection actions use the cloud. */
export function ExtensionGroupSyncCard({ className, onSynced, actions }: { className?: string; onSynced?: () => void; actions?: ReactNode }) {
  return <div dir="rtl" className={className}><CloudGroupConnection onRefresh={() => onSynced?.()} />{actions}</div>;
}
export default ExtensionGroupSyncCard;
