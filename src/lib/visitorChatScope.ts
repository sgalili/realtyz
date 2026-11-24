import type { PlatformMode } from '@/hooks/usePlatformMode';

/** Retain the original marketplace transcript without carrying it into broker chat. */
export function visitorChatScope(mode: PlatformMode) {
  return mode === 'brokers_only' ? 'toraff-visitor-rita-history-brokers-only' : 'toraff-visitor-rita-history';
}

export function visitorLiveTokenKey(scope?: string) {
  return scope === visitorChatScope('brokers_only') ? 'toraff-rita-live-token-brokers-only' : 'toraff-rita-live-token';
}

export const BROKER_VISITOR_GREETING = 'היי, אני ריטה! כאן כדי להכיר לך את TORAFF למתווכים. במה להתחיל: נכסים, לידים או קמפיינים?';