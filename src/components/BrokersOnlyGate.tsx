import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePlatformMode } from '@/hooks/usePlatformMode';

/** Redirects marketplace-only screens while brokers-only mode is on; full marketplace renders children unchanged. */
export function BrokersOnlyGate({ to, children }: { to: string; children: ReactNode }) {
  const { data, isLoading } = usePlatformMode();
  if (isLoading) return null;
  return data !== 'full_marketplace' ? <Navigate to={to} replace /> : <>{children}</>;
}
