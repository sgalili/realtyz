import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useRotatingMessages } from '@/hooks/useRotatingMessages';
import { resolveRotatingMessageAudience } from '@/lib/rotatingMessages';
import { advanceTypewriter, INITIAL_TYPEWRITER_STATE, typewriterDelay } from '@/lib/typewriter';

export function TypewriterBanner() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const reducedMotion = useReducedMotion();
  const audience = resolveRotatingMessageAudience({ signedIn: !!user, roles, partnerMode: isPartnerMode });
  const { data } = useRotatingMessages(audience, !user || !rolesLoading);
  const messages = useMemo(() => (data ?? []).map((message) => message.message_text), [data]);
  const signature = messages.join('\u0000');
  const [state, setState] = useState(INITIAL_TYPEWRITER_STATE);

  useEffect(() => setState(INITIAL_TYPEWRITER_STATE), [signature]);

  useEffect(() => {
    if (reducedMotion || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      setState((current) => advanceTypewriter(current, messages));
    }, typewriterDelay(state));
    return () => window.clearTimeout(timer);
  }, [messages, reducedMotion, state]);

  if (messages.length === 0) return <div className="min-w-0 flex-1" aria-hidden="true" />;

  const messageIndex = state.messageIndex % messages.length;
  const currentMessage = messages[messageIndex];
  const visibleText = reducedMotion ? currentMessage : currentMessage.slice(0, state.characterCount);

  return (
    <div
      className="mx-2 flex min-w-0 flex-1 items-center justify-center overflow-hidden text-center sm:mx-4"
      aria-label={currentMessage}
      title={currentMessage}
    >
      <span className="sr-only" aria-live="polite">{currentMessage}</span>
      <span aria-hidden="true" className="truncate text-[12px] font-medium leading-8 text-muted-foreground sm:text-[14px]">
        {visibleText}
        {!reducedMotion && <span className="ms-0.5 inline-block h-[1.05em] w-px translate-y-[2px] animate-pulse bg-primary" />}
      </span>
    </div>
  );
}

export default TypewriterBanner;
