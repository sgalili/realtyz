/**
 * Pre-app fast paths ported from the former src/main.tsx:
 * - /r/:code short links resolve and redirect without mounting the app.
 * - OAuth popups hand the grant to the opener and close; when closing is
 *   blocked the app mounts so the callback page can finish the exchange.
 */
import * as React from 'react';

function oauthBridgeWanted(): boolean {
  if (!/^\/oauth\/callback\/?$/.test(window.location.pathname)) return false;
  // Only take the popup shortcut when there really IS an opener to hand the
  // grant to. Full-page redirects (Google one-click) must reach the callback route.
  let hasOpener = false;
  try {
    hasOpener = !!window.opener && !window.opener.closed && window.opener !== window;
  } catch {
    hasOpener = !!window.opener;
  }
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const state = params.get('state') ?? hash.get('state') ?? '';
  return hasOpener && !state.startsWith('facebook');
}

async function handleShortLink(code: string): Promise<void> {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  let longUrl = '';
  try {
    const res = await fetch(`${base}/functions/v1/shortlink-resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ slug: code }),
    });
    const json = await res.json().catch(() => null);
    longUrl = String((json as { long_url?: unknown } | null)?.long_url || '');
  } catch {
    longUrl = '';
  }
  if (!longUrl) {
    window.location.replace('https://realtyz.co.il');
    return;
  }
  // Normalise any WhatsApp flavour to the universal link.
  let phone = '';
  let text = '';
  try {
    const u = new URL(longUrl.replace(/^whatsapp:\/\//i, 'https://whatsapp.local/'));
    const host = u.hostname.toLowerCase();
    if (host === 'wa.me' || host === 'whatsapp.local' || host.endsWith('whatsapp.com')) {
      phone = (u.searchParams.get('phone') || u.pathname.replace(/\D/g, '')).replace(/\D/g, '');
      text = u.searchParams.get('text') || '';
    }
  } catch {
    /* noop */
  }
  if (!phone) {
    window.location.replace(longUrl);
    return;
  }
  window.location.replace(`https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
}

type Mode = 'shortlink' | 'oauth' | 'app';

export function BootGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>(() => {
    if (/^\/r\/([A-Za-z0-9_-]+)\/?$/.test(window.location.pathname)) return 'shortlink';
    return oauthBridgeWanted() ? 'oauth' : 'app';
  });

  React.useEffect(() => {
    if (mode === 'shortlink') {
      const code = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/)?.[1];
      if (code) void handleShortLink(code);
      return;
    }
    if (mode !== 'oauth') return;
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    try {
      window.opener?.postMessage(
        {
          type: 'realtyz-oauth-callback',
          code: params.get('code') ?? hash.get('code'),
          state: params.get('state') ?? hash.get('state') ?? '',
          error: params.get('error') ?? hash.get('error'),
          errorDescription: params.get('error_description') ?? hash.get('error_description'),
        },
        window.location.origin,
      );
    } catch {
      // noop
    }
    let fallback: number | undefined;
    const close = window.setTimeout(() => {
      try { window.close(); } catch { /* noop */ }
      // Give the browser a moment; if the window is still here, mount the app.
      fallback = window.setTimeout(() => { if (!window.closed) setMode('app'); }, 600);
    }, 200);
    return () => { window.clearTimeout(close); if (fallback) window.clearTimeout(fallback); };
  }, [mode]);

  if (mode === 'shortlink') {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center text-[15px] text-foreground/80">
        <p>פותחים עבורכם וואטסאפ…</p>
      </div>
    );
  }
  if (mode === 'oauth') {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="m-0 text-sm text-muted-foreground">מסיים אימות מאובטח...</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
