import type { PlatformMode } from '@/hooks/usePlatformMode';
import { publicUrl } from '@/lib/publicUrl';

/** Retain the original marketplace transcript without carrying it into broker chat. */
export function visitorChatScope(mode: PlatformMode) {
  return mode === 'brokers_only' ? 'toraff-visitor-rita-history-brokers-only' : 'toraff-visitor-rita-history';
}

export function visitorLiveTokenKey(scope?: string) {
  return scope === visitorChatScope('brokers_only') ? 'toraff-rita-live-token-brokers-only' : 'toraff-rita-live-token';
}

export const BROKER_VISITOR_GREETING = 'היי, אני ריטה! נעים להכיר 😊 מה יעזור היום בעבודת התיווך: ניהול נכסים, טיפול בלידים או הכנת קמפיין?';

/** Resolve only approved entry links for the broker visitor's next-step controls. */
export function brokerVisitorEntryLinks(text: string) {
  return text.replace(/\]\((\/auth\?mode=(?:signup|login)|\/demo\/broker\/properties)\)/g, (_match, path: string) => `](${publicUrl(path)})`);
}