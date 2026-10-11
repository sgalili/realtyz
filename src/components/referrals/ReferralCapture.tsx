import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { captureRefFromLocation, getStoredRefCode } from '@/lib/referralAttribution';

const db = supabase as any;

/**
 * Captures ?ref=CODE / /ref/CODE into localStorage + cookie (30 days) and, once a
 * user session exists, attributes the signup once via register_referral().
 */
export function ReferralCapture() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const attributed = useRef<string | null>(null);

  useEffect(() => {
    const code = captureRefFromLocation();
    if (code && /^\/ref\//i.test(location.pathname)) {
      navigate(user ? '/' : '/auth', { replace: true });
    }
  }, [location.pathname, navigate, user]);

  useEffect(() => {
    if (!user?.id) { attributed.current = null; return; }
    if (attributed.current === user.id) return;
    const code = getStoredRefCode();
    if (!code) return;
    attributed.current = user.id;
    void (async () => {
      try {
        const { error } = await db.rpc('register_referral', { _code: code });
        if (error) attributed.current = null;
      } catch {
        attributed.current = null;
      }
    })();
  }, [user?.id]);

  return null;
}

export default ReferralCapture;
