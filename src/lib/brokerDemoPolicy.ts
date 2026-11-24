import type { PlatformMode } from '@/hooks/usePlatformMode';
import type { DemoType } from '@/pages/demo/demoData';

// These are the existing broker pages, not a second demo interface.
const brokerPages = ['/properties', '/properties-hub', '/dashboard', '/command-center', '/tasks', '/signatures', '/campaigns', '/ads', '/campaign-strategy', '/approval-queue', '/inbox', '/communication', '/crm', '/leads', '/lead-crm', '/lead-profile', '/crm/profile', '/profile', '/api-settings', '/settings/connections', '/social-connect', '/knowledge', '/strategy-bank', '/wallet', '/billing', '/business-performance', '/insights', '/activity-log', '/live-activity', '/automations', '/ai-content', '/terms', '/privacy-policy', '/faq', '/about-toraff'];
export function brokerDemoRedirect(path: string, mode: PlatformMode): string | null {
  if (mode !== 'brokers_only') return null;
  if (path === '/commission-mechanism' || path === '/pricing') return null;
  return brokerPages.some(base => path === base || path.startsWith(`${base}/`)) ? null : '/properties';
}
export const demoPersona = (role: DemoType, mode: PlatformMode): DemoType => mode === 'brokers_only' ? 'broker' : role;
export function isDemoWindowUrl(url: string, origin: string) {
  const destination = new URL(url, origin);
  return destination.origin === origin && /^\/demo(?:\/|$)/.test(destination.pathname);
}