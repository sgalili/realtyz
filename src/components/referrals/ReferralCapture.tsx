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
  const attributed = useRef(false);

  useEffect(() => {
    const code = captureRefFromLocation();
    if (code && /^\/ref\//i.test(location.pathname)) {
      navigate(user ? '/' : '/auth', { replace: true });
    }
  }, [location.pathname, navigate, user]);

  useEffect(() => {
    if (!user?.id || attributed.current) return;
    const code = getStoredRefCode();
    if (!code) return;
    attributed.current = true;
    db.rpc('register_referral', { _code: code }).catch(() => {
      attributed.current = false;
    });
  }, [user?.id]);

  return null;
}

export default ReferralCapture;
