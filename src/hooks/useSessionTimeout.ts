import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { logAuditEvent } from '@/lib/auditLog';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

/**
 * Auto-signs out the user after 30 minutes of inactivity.
 * Resets on any user interaction.
 */
export function useSessionTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      await logAuditEvent({ action: 'session_timeout' });
      await supabase.auth.signOut();
      toast.info('הופנית החוצה - הסשן פג לאחר 30 דקות של חוסר פעילות');
    }, SESSION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    resetTimer();
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [resetTimer]);
}
