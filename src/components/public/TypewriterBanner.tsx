import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useRotatingMessages } from '@/hooks/useRotatingMessages';
import { resolveRotatingMessageAudience, rotatingMessageNavigation } from '@/lib/rotatingMessages';
import { advanceTypewriter, INITIAL_TYPEWRITER_STATE, typewriterDelay } from '@/lib/typewriter';

export function TypewriterBanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const reducedMotion = useReducedMotion();
  const audience = resolveRotatingMessageAudience({ signedIn: !!user, roles, partnerMode: isPartnerMode });
  const { data } = useRotatingMessages(audience, !user || !rolesLoading);
  const messageRows = useMemo(() => data ?? [], [data]);
  const messages = useMemo(() => messageRows.map((message) => message.message_text), [messageRows]);
  const signature = messages.join('\u0000');
  const [state, setState] = useState(INITIAL_TYPEWRITER_STATE);

  // The whole sentence must stay readable, so the row reserves the space the
  // longest message in this audience needs instead of clipping text with an
  // ellipsis.
  const longestMessage = useMemo(
    () => messages.reduce((longest, message) => (message.length > longest.length ? message : longest), ''),
    [messages],
  );

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
  const currentAction = rotatingMessageNavigation(messageRows[messageIndex]?.action_path);
  const visibleText = reducedMotion ? currentMessage : currentMessage.slice(0, state.characterCount);

  return (
    <button
      type="button"
      disabled={!currentAction}
      onClick={() => {
        if (!currentAction) return;
        navigate(currentAction.path, { state: currentAction.state });
      }}
      className="mx-2 flex min-w-0 flex-1 cursor-pointer items-center text-start disabled:cursor-default sm:mx-4"
      aria-label={currentMessage}
      title={currentMessage}
    >
      <span className="sr-only" aria-live="polite">{currentMessage}</span>
      <span aria-hidden="true" className="relative block w-full text-start text-[15px] font-medium leading-[1.45] text-muted-foreground">
        <span className="invisible block [overflow-wrap:anywhere]">{longestMessage}</span>
        <span className="absolute inset-0 block [overflow-wrap:anywhere]">
          {visibleText}
          {!reducedMotion && <span className="ms-0.5 inline-block h-[1.05em] w-px translate-y-[2px] animate-pulse bg-primary" />}
        </span>
      </span>
    </button>
  );
}

export default TypewriterBanner;
