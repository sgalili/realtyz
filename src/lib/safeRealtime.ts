// Defensive wrappers around Supabase Realtime.
//
// Why: a single throwing `postgres_changes` handler (or a channel created while
// the socket is mid-reconnect) propagates up into the Supabase client's own
// recovery routines (`_recoverAndRefresh` / `_notifyAllSubscribers`) and takes
// the whole client down — every later query silently stops working.
// Everything here fails soft: log once, never throw.
import { supabase } from '@/integrations/supabase/client';

type AnyChannel = ReturnType<typeof supabase.channel>;

function warn(scope: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[realtime] ${scope}`, err);
}

/**
 * Creates a channel whose `.on()` handlers can never throw into the Supabase
 * client, and whose `.subscribe()` never throws into React render/effects.
 * On any failure a no-op stub is returned so callers stay simple.
 */
export function safeChannel(name: string): AnyChannel {
  let channel: AnyChannel;
  try {
    channel = supabase.channel(name);
  } catch (err) {
    warn(`channel("${name}") failed`, err);
    return makeStub();
  }

  const originalOn = channel.on.bind(channel) as (...args: any[]) => AnyChannel;
  const originalSubscribe = channel.subscribe.bind(channel) as (...args: any[]) => AnyChannel;

  (channel as any).on = (...args: any[]) => {
    const cbIndex = args.length - 1;
    const cb = args[cbIndex];
    if (typeof cb === 'function') {
      args[cbIndex] = (payload: any) => {
        try {
          const out = cb(payload);
          if (out && typeof out.then === 'function') {
            out.catch((err: unknown) => warn(`handler rejected on "${name}"`, err));
          }
        } catch (err) {
          warn(`handler threw on "${name}"`, err);
        }
      };
    }
    try {
      originalOn(...args);
    } catch (err) {
      warn(`on() failed on "${name}"`, err);
    }
    return channel;
  };

  (channel as any).subscribe = (...args: any[]) => {
    try {
      originalSubscribe(...args);
    } catch (err) {
      warn(`subscribe() failed on "${name}"`, err);
    }
    return channel;
  };

  return channel;
}

/** Tears a channel down without ever throwing (safe inside effect cleanups). */
export function removeChannelSafe(channel: unknown) {
  if (!channel) return;
  try {
    const result = supabase.removeChannel(channel as AnyChannel) as any;
    if (result && typeof result.then === 'function') {
      result.catch((err: unknown) => warn('removeChannel rejected', err));
    }
  } catch (err) {
    warn('removeChannel failed', err);
  }
}

/** Pushes the current access token to the realtime socket; never throws. */
export async function pushRealtimeAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) (supabase as any).realtime.setAuth(token);
  } catch (err) {
    warn('setAuth failed', err);
  }
}

function makeStub(): AnyChannel {
  const stub: any = {
    on: () => stub,
    subscribe: () => stub,
    unsubscribe: async () => 'ok',
    send: async () => 'ok',
    topic: 'realtyz-noop',
  };
  return stub as AnyChannel;
}
