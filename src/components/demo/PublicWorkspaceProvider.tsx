import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { isDemoType, type DemoType } from '@/pages/demo/demoData';
import type { PublicWorkspaceData } from '@/lib/publicWorkspaceData';
import { demoOwner } from '@/lib/publicWorkspaceData';
import { useWorkspace } from '@/hooks/useWorkspace';

export const PublicWorkspaceContext = createContext<PublicWorkspaceData | null>(null);
export const usePublicWorkspace = () => useContext(PublicWorkspaceContext);
export function publicWorkspaceRoute(path: string): { role: DemoType; base: string; choose: boolean } | null {
  if (!/^\/demo(?:\/|$)/.test(path)) return null;
  const candidate = path.split('/')[2];
  const role = isDemoType(candidate) ? candidate : 'broker';
  return { role, base: isDemoType(candidate) ? `/demo/${role}` : '/demo', choose: !isDemoType(candidate) };
}
export const switchPublicWorkspace = (owner: string) => {
  const types: DemoType[] = ['broker', 'marketing', 'developer', 'owner', 'buyer', 'affiliate'];
  const type = types.find(t => demoOwner(t) === owner);
  if (type) { window.history.pushState(null, '', `/demo/${type}`); window.dispatchEvent(new Event('toraff:public-demo-role')); }
};
export function PublicWorkspaceProvider({ store, children }: { store: PublicWorkspaceData | null; children: ReactNode }) {
  return <PublicWorkspaceContext.Provider value={store}>{children}</PublicWorkspaceContext.Provider>;
}
export function InitialDemoWorkspaceChoice({ enabled }: { enabled: boolean }) {
  const { openSelector } = useWorkspace();
  useEffect(() => { if (enabled) openSelector(); }, [enabled]);
  return null;
}