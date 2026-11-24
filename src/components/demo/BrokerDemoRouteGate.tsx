import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePublicWorkspace } from './PublicWorkspaceProvider';
import { brokerDemoRedirect } from '@/lib/brokerDemoPolicy';

export function BrokerDemoRouteGate({ children }: { children: ReactNode }) {
  const demo = usePublicWorkspace();
  const { pathname } = useLocation();
  const redirect = demo ? brokerDemoRedirect(pathname, demo.platformMode) : null;
  return redirect ? <Navigate to={redirect} replace /> : <>{children}</>;
}