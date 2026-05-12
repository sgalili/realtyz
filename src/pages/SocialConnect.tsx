import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';

type Network = {
  platform: string;
  display?: string;
  name?: string;
};

type Connected = {
  platform: string;
  displayName?: string;
  username?: string;
  userImage?: string;
};

const PLATFORM_META: Record<string, { name: string; bg: string; ring: string; text: string; logo: JSX.Element }> = {
  instagram: {
    name: 'Instagram',
    bg: 'bg-gradient-to-br from-[#feda75] via-[#fa7e1e] via-40% to-[#d62976]',
    ring: 'ring-[#d62976]/30',
    text: 'text-white',
    logo: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.5.3 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.5.2-1.1.3-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.5-.3-1.1-.4-2.2-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.5-.2 1.1-.3 2.2-.4 1.3-.1 1.6-.1 4.8-.1zm0 2.2c-3.1 0-3.5 0-4.7.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.2.8-.3 1.7C3.5 9.4 3.5 9.7 3.5 12.8s0 3.5.1 4.7c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.2 1.7.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.2-.8.3-1.7.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.2-1.7-.3-1.2-.1-1.6-.1-4.7-.1zm0 3.4a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8zm0 2.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm5.6-2.5a1 1 0 1 1-2.1 0 1 1 0 0 1 2.1 0z"/></svg>
    ),
  },
  facebook: {
    name: 'Facebook',
    bg: 'bg-[#1877F2]',
    ring: 'ring-[#1877F2]/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3v-2.6c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/></svg>,
  },
  linkedin: {
    name: 'LinkedIn',
    bg: 'bg-[#0A66C2]',
    ring: 'ring-[#0A66C2]/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5V9h3zm-1.5-11.3a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zM19 19h-3v-5.6c0-1.4-.5-2.3-1.7-2.3a1.9 1.9 0 0 0-1.8 1.3c-.1.2-.1.5-.1.8V19h-3V9h3v1.3a3 3 0 0 1 2.7-1.5c2 0 3.5 1.3 3.5 4.1z"/></svg>,
  },
  twitter: {
    name: 'X (Twitter)',
    bg: 'bg-black',
    ring: 'ring-black/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M18.244 2H21l-6.52 7.45L22 22h-6.79l-4.78-6.27L4.8 22H2l7-8L2 2h6.91l4.32 5.71L18.24 2zm-2.38 18h1.66L7.23 4H5.5l10.36 16z"/></svg>,
  },
  tiktok: {
    name: 'TikTok',
    bg: 'bg-black',
    ring: 'ring-[#FE2C55]/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M16.5.02c1.3-.02 2.6-.01 3.9-.02.08 1.5.63 3.1 1.75 4.17 1.12 1.1 2.7 1.6 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21a7.8 7.8 0 0 1-4.08-1.03c-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44a3.6 3.6 0 0 0-3.02.37c-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>,
  },
  youtube: {
    name: 'YouTube',
    bg: 'bg-[#FF0000]',
    ring: 'ring-[#FF0000]/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>,
  },
  pinterest: {
    name: 'Pinterest',
    bg: 'bg-[#E60023]',
    ring: 'ring-[#E60023]/30',
    text: 'text-white',
    logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M12 0a12 12 0 0 0-4.4 23.2c-.1-1-.2-2.4 0-3.5l1.5-6.3s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4.1-.3 1.2.6 2.2 1.8 2.2 2.2 0 3.8-2.3 3.8-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.5 2.6-5.5 5.3 0 1 .4 2.2.9 2.8.1.1.1.2.1.3l-.4 1.5c-.1.2-.2.3-.4.2-1.6-.7-2.5-3-2.5-4.8 0-3.9 2.8-7.5 8.2-7.5 4.3 0 7.6 3 7.6 7.1 0 4.3-2.7 7.7-6.4 7.7-1.3 0-2.4-.7-2.8-1.4l-.8 2.9c-.3 1-1 2.4-1.5 3.2A12 12 0 1 0 12 0z"/></svg>,
  },
  threads: { name: 'Threads', bg: 'bg-black', ring: 'ring-black/30', text: 'text-white', logo: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M12.2 23h-.1c-3.4 0-6-1.1-7.8-3.3C2.7 17.8 1.8 15.1 1.8 12s1-5.8 2.6-7.7C6.2 2.1 8.8 1 12.2 1h.1c2.6 0 4.7.6 6.4 1.9 1.6 1.2 2.7 3 3.3 5.1l-2.2.7c-1-3.4-3.3-5.2-7.5-5.2H12c-2.7 0-4.7.8-6 2.4C4.7 7.4 4 9.5 4 12s.7 4.6 2 6.1c1.3 1.6 3.3 2.4 6 2.4h.2c2.4 0 4-.6 5.3-1.9.4-.4.7-.9.9-1.4-.2 0-.5-.1-.8-.2-1.4-.3-2.7-1.1-3.4-2.1-.6-.8-.9-1.8-.7-2.7.1-1 .8-1.8 1.8-2.4 1.1-.6 2.5-.8 4-.6.5.1 1 .2 1.4.3 0-.4 0-.8-.1-1.1-.4-1.3-1.3-1.9-2.7-2-1.1-.1-2.5.3-3 1.4l-1.9-1c.7-1.7 2.6-2.6 5-2.5 2.3.2 3.9 1.5 4.5 3.5.4 1.3.4 2.7.2 4 .4.2.7.5 1 .7 1 .9 1.5 2.1 1.5 3.5 0 1.7-.7 3.2-2 4.4-1.7 1.6-3.9 2.4-7 2.4z"/></svg> },
  bluesky: { name: 'Bluesky', bg: 'bg-[#0085FF]', ring: 'ring-[#0085FF]/30', text: 'text-white', logo: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M12 10.8C10.6 8 6.4 3 4 3 1.5 3 0 4.8 0 7.6c0 3 1.8 5.4 4 6 1 .2 2 .3 3 0-3.7.6-7 2-2.7 7 4.7 5.3 6.4-1.1 7.3-4.4.9 3.3 1.9 9.5 7.1 4.4 4-4.5 1.1-6.4-2.6-7 .9.3 2 .2 3 0 2.2-.6 4-3 4-6C24 4.8 22.5 3 20 3c-2.4 0-6.6 5-8 7.8z"/></svg> },
  reddit: { name: 'Reddit', bg: 'bg-[#FF4500]', ring: 'ring-[#FF4500]/30', text: 'text-white', logo: <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M12 0a12 12 0 1 0 0 24A12 12 0 0 0 12 0zm5.4 13.5a1 1 0 0 1 0 .2c0 2.2-2.6 4-5.7 4s-5.7-1.8-5.7-4a1 1 0 0 1 0-.2 1.2 1.2 0 1 1 1.2 1.5c1 .8 2.5 1.3 4.5 1.3s3.5-.5 4.5-1.3a1.2 1.2 0 1 1 1.2-1.5zM7.7 11.4a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 0 1-2.4 0zm6 0a1.2 1.2 0 1 1 2.4 0 1.2 1.2 0 0 1-2.4 0z"/></svg> },
};

function platformMeta(p: string) {
  return PLATFORM_META[p.toLowerCase()] || {
    name: p.charAt(0).toUpperCase() + p.slice(1),
    bg: 'bg-slate-700',
    ring: 'ring-slate-700/30',
    text: 'text-white',
    logo: <span className="text-lg font-bold uppercase">{p[0]}</span>,
  };
}

export default function SocialConnect() {
  const [loading, setLoading] = useState(true);
  const [linkingPlatform, setLinkingPlatform] = useState<string | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [connected, setConnected] = useState<Connected[]>([]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-status', { body: {} });
      if (error) throw error;
      const nets: Network[] = Array.isArray(data?.networks)
        ? data.networks.map((n: any) => ({ platform: (n.platform || n.name || n).toString().toLowerCase(), display: n.display || n.displayName }))
        : Object.keys(PLATFORM_META).map((p) => ({ platform: p }));
      setNetworks(nets);
      setConnected(Array.isArray(data?.connected) ? data.connected : []);
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בטעינת רשתות', { description: e.message });
      setNetworks(Object.keys(PLATFORM_META).map((p) => ({ platform: p })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const connectedSet = useMemo(() => new Set(connected.map((c) => c.platform.toLowerCase())), [connected]);

  async function connect(platform: string) {
    setLinkingPlatform(platform);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-social-link', { body: { platform } });
      // Surface the real backend error message (FunctionsHttpError exposes context.response)
      let backendMsg: string | null = null;
      if (error) {
        try {
          const resp = (error as any)?.context?.response ?? (error as any)?.context;
          if (resp && typeof resp.json === 'function') {
            const body = await resp.json();
            backendMsg = body?.error || body?.message || null;
          } else if (data && typeof data === 'object' && (data as any).error) {
            backendMsg = (data as any).error;
          }
        } catch { /* ignore */ }
        throw new Error(backendMsg || error.message || 'Edge Function error');
      }
      if (data && (data as any).error) throw new Error((data as any).error);
      if (!data?.url) throw new Error('לא התקבל קישור מהשרת');
      window.top!.location.replace(data.url);
    } catch (e: any) {
      console.error('[SocialConnect] connect failed', e);
      toast.error('שגיאה בחיבור הרשת', { description: e?.message || 'שגיאה לא ידועה' });
      setLinkingPlatform(null);
    }
  }

  const visibleNetworks = networks.length
    ? networks.filter((n) => PLATFORM_META[n.platform] || true)
    : Object.keys(PLATFORM_META).map((p) => ({ platform: p }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">חיבור רשתות חברתיות</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            חבר את חשבונות הסושיאל שלך ב־Realtyz — אינסטגרם, פייסבוק, לינקדאין, X ועוד. ההתחברות חלקה, ללא מיתוג צד שלישי.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> טוען רשתות...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleNetworks.map((n) => {
            const meta = platformMeta(n.platform);
            const isConnected = connectedSet.has(n.platform.toLowerCase());
            const isLinking = linkingPlatform === n.platform;
            return (
              <Card key={n.platform} className="overflow-hidden border-border/60">
                <div className={`${meta.bg} ${meta.text} p-5 flex items-center gap-3`}>
                  <div className="rounded-xl bg-white/15 p-2 backdrop-blur">{meta.logo}</div>
                  <div className="flex-1">
                    <div className="font-semibold leading-tight">{meta.name}</div>
                    {isConnected && (
                      <div className="flex items-center gap-1 text-xs opacity-90 mt-0.5">
                        <CheckCircle2 className="h-3 w-3" /> מחובר
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {isConnected ? (
                    <Badge variant="secondary" className="w-full justify-center py-1">פעיל</Badge>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => connect(n.platform)}
                      disabled={isLinking}
                    >
                      {isLinking ? (
                        <><Loader2 className="h-4 w-4 animate-spin ml-2" /> מעביר...</>
                      ) : (
                        <>חיבור <ExternalLink className="h-4 w-4 mr-2" /></>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        ההתחברות מאובטחת ומבוצעת דרך Realtyz בלבד. תוכל להתנתק בכל רגע.
      </p>
    </div>
  );
}
