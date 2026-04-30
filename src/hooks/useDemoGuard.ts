import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { requestDemoUpgrade } from '@/lib/demoGuard';

export function useDemoGuard() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();

  return (reason?: string) => {
    if (isDemoMode && !user) {
      requestDemoUpgrade(reason);
      return true;
    }
    return false;
  };
}