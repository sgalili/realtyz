import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { useRotatingMessages } from '@/hooks/useRotatingMessages';
import { resolveRotatingMessageAudience, rotatingMessageNavigation } from '@/lib/rotatingMessages';
import { advanceTypewriter, INITIAL_TYPEWRITER_STATE, typewriterDelay } from '@/lib/typewriter';
import { usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';

export function TypewriterBanner({ brokersOnly = false }: { brokersOnly?: boolean } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const reducedMotion = useReducedMotion();
  const simulation = usePublicWorkspace();
  const audience = resolveRotatingMessageAudience({ signedIn: !!user && !simulation, roles, partnerMode: isPartnerMode, brokersOnly });
  const { data } = useRotatingMessages(audience, !user || !rolesLoading);
  const messageRows = useMemo(() => data ?? [], [data]);
  const messages = useMemo(() => messageRows.map((message) => message.message_text), [messageRows]);
  const signature = messages.join('\u0000');
  const [state, setState] = useState(INITIAL_TYPEWRITER_STATE);

  useEffect(() => setState(INITIAL_TYPEWRITER_STATE), [signature]);

  useEffect(() => {
    if (reducedMotion || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      setState((current) => advanceTypewriter(current, messages));
    }, typewriterDelay(state, messages));
    return () => window.clearTimeout(timer);
  }, [messages, reducedMotion, state]);

  const messageIndex = messages.length > 0 ? state.messageIndex % messages.length : 0;
  const currentMessage = messages[messageIndex] ?? '';
  const currentAction = rotatingMessageNavigation(messageRows[messageIndex]?.action_path);
  const visibleText = reducedMotion ? currentMessage : currentMessage.slice(0, state.characterCount);

  // One line only: the sentence never wraps to a second line. When it is longer
  // than the room left in the toolbar, the line slides sideways inside the same
  // row so the characters written last stay visible until the end of the text.
  const clipRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const text = textRef.current;
    if (!clip || !text) {
      setOverflow(0);
      return;
    }
    const measure = () => setOverflow(Math.max(0, text.offsetWidth - clip.clientWidth));
    measure();
    // The text element grows one character at a time, so watching its own box
    // keeps the sideways position in step with the writing without re-creating
    // the observer on every character.
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    observer.observe(text);
    return () => observer.disconnect();
  }, [signature]);

  if (messages.length === 0) return <div className="min-w-0 flex-1" aria-hidden="true" />;

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
      <span ref={clipRef} aria-hidden="true" className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap">
        <span
          ref={textRef}
          className="block w-max max-w-none whitespace-nowrap text-[16px] font-medium leading-[1.45] text-muted-foreground"
          style={{
            transform: `translateX(${overflow}px)`,
            transition: reducedMotion ? 'none' : 'transform 140ms linear',
          }}
        >
          {visibleText}
          {!reducedMotion && <span className="ms-0.5 inline-block h-[1.05em] w-px translate-y-[2px] animate-pulse bg-primary" />}
        </span>
      </span>
    </button>
  );
}

export default TypewriterBanner;
