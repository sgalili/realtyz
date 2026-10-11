import { useCallback, useEffect, useState } from 'react';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * Dual-role app mode: one account can act as a broker (מצב מתווך) with the full
 * CRM / properties / Rita toolkit, or as a partner (מצב שותף) with only the
 * referral, commission and recruitment screens. It is a pure UI mode — the
 * account, session and workspace never change, so no second login is needed.
 */
export type AppMode = 'broker' | 'partner';

const KEY = 'realtyz-app-mode';
const EVENT = 'realtyz-app-mode-change';

/** Paths a partner-mode session is allowed to reach. */
export const PARTNER_MODE_PATHS = [
  '/',
  '/public-listings',
  '/my-ads',
  '/affiliate-pricing',
  '/affiliate-network',
  '/affiliate',
  '/affiliates',
  '/referral',
  '/profile',
  '/wallet',
  '/posts',
  '/partner/posts',
  '/partner/chats',
  '/partner/contacts',
];

export function readAppMode(): AppMode {
  try {
    return window.localStorage.getItem(KEY) === 'partner' ? 'partner' : 'broker';
  } catch {
    return 'broker';
  }
}

export function writeAppMode(mode: AppMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* storage disabled */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function isPartnerModePath(pathname: string): boolean {
  return PARTNER_MODE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function useAppMode() {
  const { isAffiliate, isAffiliateOnly } = useUserRole();
  const [mode, setModeState] = useState<AppMode>(() => readAppMode());

  useEffect(() => {
    const sync = () => setModeState(readAppMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    writeAppMode(next);
  }, []);

  // A stored display preference never creates partner authorization.
  const effectiveMode: AppMode = isAffiliate && (isAffiliateOnly || mode === 'partner') ? 'partner' : 'broker';
  return { mode: effectiveMode, setMode, isPartnerMode: effectiveMode === 'partner', isBrokerMode: effectiveMode === 'broker' };
}
