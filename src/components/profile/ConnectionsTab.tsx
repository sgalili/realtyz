import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, MessageSquare, Phone, Settings2 } from 'lucide-react';
import { BrandIcon } from '@/components/BrandIcon';
import { PortalBrandGlyph } from '@/components/profile/PortalBrandGlyph';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { WhatsAppConnectionModeCard } from '@/components/settings/WhatsAppConnectionModeCard';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { CalendarSyncCard } from '@/components/profile/CalendarSyncCard';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { MetaDirectConnectionCard, type MetaStatus } from '@/components/profile/MetaDirectConnectionCard';
import { useFacebookHealth } from '@/hooks/useFacebookHealth';
import { useMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { MetaWhatsAppAuthCard } from '@/components/settings/MetaWhatsAppAuthCard';
import { WorkspaceSmsCard } from '@/components/profile/WorkspaceSmsCard';
import { GoogleApiCredentialsCard } from '@/components/profile/GoogleApiCredentialsCard';
import { GoogleBrandGlyph, GoogleServiceConnectCard } from '@/components/profile/GoogleServiceConnectCard';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/useUserRole';
import { useAccountIntegrations } from '@/hooks/useAccountIntegrations';
import {
  isRememberedConnected,
  rememberConnected,
  type StickyService,
} from '@/lib/connectionStatusCache';

type Tone = 'ok' | 'idle';

type Sms019Status = {
  connected: boolean;
  sender: string | null;
  error: string | null;
};

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  // Inline styles on purpose: global CSS neutralizes utility color classes
  // (bg-emerald/bg-slate...) with !important, which washed these pills out.
  const style = tone === 'ok'
    ? { backgroundColor: 'hsl(152 62% 96%)', color: 'hsl(152 62% 28%)', borderColor: 'hsl(152 40% 75%)' }
    : { backgroundColor: 'hsl(0 80% 97%)', color: 'hsl(0 72% 45%)', borderColor: 'hsl(0 60% 82%)' };
  return (
    <span
      className="shrink-0 rounded-full border px-3 py-1 text-[13px] font-bold"
      style={style}
      dir="ltr"
    >
      {label}
    </span>
  );
}


/**
 * Collapsible connection section. Collapsed rows show only the connection name
 * and its live status; opening one closes the previously open section.
 * Inner card chrome (border + its own header) is neutralized so the section
 * header is the single source of truth for the title.
 */
/** Official multicolor Google "G" mark. */
function GoogleGMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-5 w-5 shrink-0', className)} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6.1C12.3 13.7 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.15-3.1-.42-4.6H24v9.1h12.4c-.55 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.3A14.6 14.6 0 0 1 9.6 24c0-1.5.27-2.95.77-4.3l-7.8-6.1A23.9 23.9 0 0 0 0 24c0 3.85.92 7.5 2.6 10.7l7.8-6.4z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2.05 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.25-7.8 2.25-6.4 0-11.7-4.2-13.6-10.2l-7.8 6.4C6.5 42.2 14.6 47.5 24 47.5z" />
    </svg>
  );
}

function ConnectionSection({
  title,
  titleAside,
  titleLead,
  titleNode,
  status,
  tone,
  open,
  onToggle,
  children,
  headerAside,
  bodyClassName,
  restricted,
}: {
  title: string;
  titleAside?: ReactNode;
  /** Logo rendered at the very start of header row, before the label. */
  titleLead?: ReactNode;
  /** Fully custom label row (replaces titleLead + title + titleAside). */
  titleNode?: ReactNode;
  status: string;
  tone: Tone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  headerAside?: ReactNode;
  bodyClassName?: string;
  /** Super-admin only section — marked with a red border. */
  restricted?: boolean;
}) {
  return (
    <div
      dir="rtl"
      className="rounded-xl border bg-card text-right shadow-sm"
      style={restricted ? { borderColor: 'hsl(0 72% 51%)' } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-right"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          {titleNode ?? (
            <>
              {titleLead}
              <span className="truncate text-sm font-semibold">{title}</span>
              {titleAside}
            </>
          )}
        </span>
        {headerAside ?? <StatusPill label={status} tone={tone} />}
      </button>
      {open && (
        <div
          className={cn(
            'border-t px-1 pb-1 pt-[10px] text-right',
            bodyClassName,
            // neutralize the nested Card chrome + hide its duplicate header
            '[&_[data-conn-body]>div:not([data-plain])]:border-0 [&_[data-conn-body]>div:not([data-plain])]:bg-transparent [&_[data-conn-body]>div:not([data-plain])]:shadow-none',
            '[&_[data-conn-body]>div:not([data-plain])>:first-child]:hidden',
            // grouped sections (e.g. all WhatsApp accounts in one card):
            // neutralize each nested card one level deeper instead
            '[&_[data-plain]>section>div:not([data-keep])]:border-0 [&_[data-plain]>section>div:not([data-keep])]:bg-transparent [&_[data-plain]>section>div:not([data-keep])]:shadow-none',
            '[&_[data-plain]>section>div:not([data-keep])>:first-child]:hidden',
            // RTL text + label alignment for every field inside
            '[&_label]:block [&_label]:text-right',
            '[&_input:not([dir])]:text-right [&_textarea:not([dir])]:text-right',
            '[&_input:not([dir])]:placeholder:text-right [&_textarea:not([dir])]:placeholder:text-right',
            '[&_p]:text-right [&_h3]:text-right [&_h4]:text-right',
          )}
        >
          <div data-conn-body dir="rtl">{children}</div>
        </div>
      )}
    </div>
  );
}

export function ConnectionsTab() {
  const { activeWorkspaceId } = useWorkspace();
  // Returning from the full-page Facebook OAuth redirect: open the Meta section
  // so its card mounts and can surface the success/error state immediately.
  const [openId, setOpenId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const target = params.get('connect');
      if (params.has('fb') || target === 'facebook') return 'meta';
      if (target === 'whatsapp-meta' || target === 'whatsapp') return 'whatsapp';
      if (params.has('google') || target === 'google') return 'google';
      return null;
    } catch {
      return null;
    }
  });
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [waMode, setWaMode] = useState<string | null>(null);
  const [greenReady, setGreenReady] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  // Live phone numbers so a collapsed row shows the actual connected number.
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [greenPhone, setGreenPhone] = useState<string | null>(null);
  const [voicePhone, setVoicePhone] = useState<string | null>(null);
  const [googleAdvancedOpen, setGoogleAdvancedOpen] = useState(false);
  const { data: fbHealth, isPending: fbHealthPending } = useFacebookHealth();
  const { data: fbBinding, isPending: fbBindingPending } = useMetaPageBinding();
  // Facebook / Instagram, WBA, Green API and Yad2 are account-level: connected
  // once, active in every workspace of this user.
  const { data: account } = useAccountIntegrations();
  const { isSuperAdmin } = useUserRole();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('manage-api-configs', { method: 'GET' });
        const rows = (data as any[]) || [];
        setGreenReady(!!rows.find((r) => r.service_name === 'Green API')?.api_key);
        setVoiceReady(!!rows.find((r) => r.service_name === 'Vapi')?.api_key);
        // Twilio: api_key = `${sid}:${token}:${phone}`
        const twilio = String(rows.find((r) => r.service_name === 'Twilio')?.api_key ?? '');
        const twilioPhone = twilio.split(':')[2] ?? '';
        if (twilioPhone.replace(/\D/g, '')) setVoicePhone(twilioPhone);
      } catch { /* silent */ }
      try {
        const { data: wap } = await supabase.from('wa_providers' as never).select('config').limit(1).maybeSingle();
        const cfg = ((wap as any)?.config ?? {}) as Record<string, unknown>;
        const display = String(cfg.display_phone_number ?? cfg.phone_number ?? '');
        if (display.replace(/\D/g, '')) setWaPhone(display);
      } catch { /* silent */ }
      try {
        const { data: green } = await supabase
          .from('social_connections')
          .select('credentials')
          .eq('platform', 'whatsapp_green')
          .maybeSingle();
        const creds = ((green as any)?.credentials ?? {}) as any;
        const gp = String(creds.phone ?? creds.wid ?? creds.manual?.phone ?? '');
        if (gp.replace(/\D/g, '')) setGreenPhone(gp);
      } catch { /* silent */ }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const ownerId = activeWorkspaceId ?? user?.id;
        if (ownerId) {
          const { data: ws } = await supabase
            .from('workspace_whatsapp_settings' as never)
            .select('*')
            .eq('workspace_owner_id', ownerId)
            .maybeSingle();
          setWaMode(((ws as any)?.connection_type as string) || null);
        }
      } catch { /* silent */ }
    })();
  }, [activeWorkspaceId]);

  // Keep the WhatsApp expanded panel in sync when the user toggles the method.
  useEffect(() => {
    const onMode = (e: Event) => {
      setWaMode((e as CustomEvent).detail as string);
    };
    window.addEventListener('realtyz:wa-mode-changed', onMode);
    return () => window.removeEventListener('realtyz:wa-mode-changed', onMode);
  }, []);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  // Live Google service statuses so the collapsed "חשבונות גוגל" header matches
  // the individual cards and reflects the combined auto-link result instantly.
  const { data: googleConns } = useQuery({
    // Strictly workspace-scoped: Udi's Google links must never show up while
    // Rita's workspace is active (and vice versa).
    queryKey: ['google-services-status', activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from('social_connections')
        .select('platform, is_connected, credentials')
        .eq('workspace_owner_id', activeWorkspaceId as string)
        .in('platform', ['gmail', 'google_calendar', 'youtube']);
      return (data ?? []) as { platform: string; is_connected: boolean; credentials: any }[];
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Once a Google service reported connected, remember it so a collapsed card
  // or a slow query can never render it as "לא מחובר".
  useEffect(() => {
    (googleConns ?? []).forEach((c) => {
      if (!c.is_connected) return;
      const label = String(
        c.credentials?.verified_identity?.email ?? c.credentials?.verified_identity?.name ?? '',
      ).trim();
      rememberConnected(c.platform as StickyService, activeWorkspaceId, label || null);
    });
  }, [googleConns, activeWorkspaceId]);
  const liveGoogle = (googleConns ?? []).filter((c) => c.is_connected);
  const connectedGoogle = new Set(liveGoogle.map((c) => c.platform));
  const googleAccountEmail = liveGoogle
    .map((c) => String(
      c.credentials?.verified_identity?.email
      ?? c.credentials?.email
      ?? c.credentials?.account_email
      ?? c.credentials?.user_email
      ?? '',
    ).trim())
    .find((value) => value.includes('@')) ?? null;
  
  const rememberedGoogle = (['gmail', 'google_calendar', 'youtube'] as StickyService[])
    .some((svc) => isRememberedConnected(svc, activeWorkspaceId));
  const someGoogleConnected = connectedGoogle.size > 0 || rememberedGoogle;
  const googleStatus: [string, Tone] = someGoogleConnected
    ? ['מחובר', 'ok']
    : ['לא מחובר', 'idle'];


  // Collapsed header badge reads the exact same shared state as the expanded
  // card badge and the global banner. Facebook / Instagram are strictly
  // workspace-scoped: never fall back to another workspace's binding.
  // The saved DB page binding is read here too, so the COLLAPSED header shows
  // "מחובר" without waiting for the card to mount and probe Graph.
  const fbLive = !!(
    fbHealth?.pageConnected
    || meta?.connected
    || (fbBinding?.pageId && fbBinding?.hasToken)
    || (account?.facebook?.pageId && account.facebook.hasToken)
  );
  useEffect(() => {
    if (fbLive) rememberConnected('facebook', activeWorkspaceId, null);
  }, [fbLive, activeWorkspaceId]);
  const fbConnected = fbLive || isRememberedConnected('facebook', activeWorkspaceId);
  const metaStatus: [string, Tone] = fbConnected
    ? ['מחובר', 'ok']
    : (fbHealthPending || fbBindingPending) && !meta
      ? ['בודק חיבור…', 'idle']
      : ['לא מחובר', 'idle'];

  // WhatsApp / Yad2 stay account-level: connected once, live in every workspace.
  const officialPhone = waPhone ?? account?.waPhone ?? null;
  const personalPhone = greenPhone ?? account?.greenPhone ?? null;
  const greenLive = greenReady || !!account?.greenConnected;

  // Single WhatsApp parent card: the collapsed header shows the live number
  // (official first, personal as fallback) instead of "לא הוגדר".
  const waHeaderPhone = officialPhone ?? personalPhone;
  const waStatus: [string, Tone] = waHeaderPhone
    ? [formatPhoneDisplay(waHeaderPhone), 'ok']
    : greenLive || waMode
      ? ['מחובר', 'ok']
      : ['לא הוגדר', 'idle'];

  const [sms019Sender, setSms019Sender] = useState<string | null>(null);

  const { data: sms019Status, isPending: sms019Pending, refetch: refetchSms019Status } = useQuery<Sms019Status>({
    queryKey: ['sms019-connection-status', activeWorkspaceId],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-sms-connection', {
        body: {
          mode: 'balance',
          workspace_owner_id: activeWorkspaceId ?? undefined,
        },
      });

      const result = (data ?? {}) as { success?: boolean; sender?: string | null; error?: string | null };
      if (error || result.success !== true) {
        return {
          connected: false,
          sender: result.sender ? String(result.sender) : null,
          error: result.error ?? error?.message ?? 'sms_connection_check_failed',
        };
      }

      return {
        connected: true,
        sender: result.sender ? String(result.sender) : null,
        error: null,
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sms019Connected = sms019Status?.connected === true || !!sms019Sender;
  const sms019DisplaySender = sms019Status?.sender ?? sms019Sender;
  const sms019BadgeText = sms019Connected ? 'מחובר' : sms019Pending ? 'בודק חיבור…' : 'לא מחובר';

  // Portal connection state drives the Yad2 / Homely brand marks in the header.
  const { data: portalStatus = { yad2: false, homely: false } } = useQuery({
    queryKey: ['listing-portals-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return { yad2: false, homely: false };
      const [keys, homely] = await Promise.all([
        supabase.from('user_api_keys').select('brightdata_api_token, brightdata_zone').eq('user_id', user.id).maybeSingle(),
        supabase.from('homely_broker_credentials' as never).select('connection_status, homely_password_encrypted').eq('user_id', user.id).maybeSingle(),
      ]);
      const k = (keys.data ?? {}) as any;
      const h = (homely.data ?? {}) as any;
      return {
        // Yad2 shows in full color as soon as the BrightData API is connected.
        yad2: Boolean(String(k?.brightdata_api_token ?? '').trim()),
        homely: h?.connection_status === 'ok' || Boolean(h?.homely_password_encrypted),
      };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const waLive = !!(officialPhone || personalPhone || greenLive || waMode);

  // Connected Facebook page picture(s) replace the "מחובר" pill in the header.
  const fbPageId = fbHealth?.pageId ?? fbBinding?.pageId ?? null;
  const fbPagePicture = fbHealth?.pagePicture
    ?? fbBinding?.pageAvatarUrl
    ?? (fbPageId ? `https://graph.facebook.com/${fbPageId}/picture?type=square&width=64&height=64` : null);

  const sections: Array<{ id: string; title: string; titleAside?: ReactNode; titleLead?: ReactNode; titleNode?: ReactNode; status: string; tone: Tone; node: ReactNode; headerAside?: ReactNode; restricted?: boolean }> = [
    {
      id: 'meta',
      title: 'פייסבוק אינסטגרם',
      titleNode: (
        <span className="flex min-w-0 items-center gap-2">
          <BrandIcon name="facebook" className={cn('h-5 w-5 shrink-0 text-[#1877F2]', !fbConnected && 'grayscale opacity-40')} />
          <span className="text-sm font-semibold">פייסבוק</span>
          <BrandIcon name="instagram" className={cn('ms-3 h-5 w-5 shrink-0 text-[#E4405F]', !fbConnected && 'grayscale opacity-40')} />
          <span className="text-sm font-semibold">אינסטגרם</span>
        </span>
      ),
      status: metaStatus[0],
      tone: metaStatus[1],
      headerAside: fbConnected && fbPagePicture ? (
        <img
          src={fbPagePicture}
          alt={fbHealth?.pageName ?? fbBinding?.pageName ?? 'עמוד פייסבוק מחובר'}
          className="h-8 w-8 shrink-0 rounded-md border object-cover"
          loading="lazy"
        />
      ) : undefined,
      node: <MetaDirectConnectionCard onStatus={setMeta} />,
    },
    {
      id: 'whatsapp',
      title: 'ווטסאפ',
      titleLead: (
        <BrandIcon name="whatsapp" className={cn('h-5 w-5 shrink-0 text-[#25D366]', !waLive && 'grayscale opacity-40')} />
      ),
      status: waStatus[0],
      tone: waStatus[1],
      node: (
        <div data-plain className="space-y-4">
          {!officialPhone && (
            <section className="space-y-2">
              <MetaWhatsAppAuthCard />
            </section>
          )}
          <section className={cn('space-y-2', !officialPhone && 'border-t pt-4')}>
            <h4 className="text-sm font-semibold">{`\n`}</h4>
            <WhatsAppConnectionModeCard />
          </section>
          {waMode === 'qr_session' && (
            <section className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-semibold">
                מספר ווטסאפ אישי
                {personalPhone && (
                  <span className="ms-2 text-xs font-normal text-muted-foreground" dir="ltr">
                    {formatPhoneDisplay(personalPhone)}
                  </span>
                )}
              </h4>
              <WhatsAppGatewayCard />
            </section>
          )}
        </div>
      ),

    },
    {
      id: 'google',
      title: 'גוגל',
      titleLead: <GoogleGMark className={someGoogleConnected ? undefined : 'grayscale opacity-40'} />,
      headerAside: (
        <span className="flex items-center gap-1.5" aria-label="שירותי Google">
          <GoogleBrandGlyph brand="gmail" connected={connectedGoogle.has('gmail') || isRememberedConnected('gmail', activeWorkspaceId)} />
          <GoogleBrandGlyph brand="calendar" connected={connectedGoogle.has('google_calendar') || isRememberedConnected('google_calendar', activeWorkspaceId)} />
          <GoogleBrandGlyph brand="youtube" connected={connectedGoogle.has('youtube') || isRememberedConnected('youtube', activeWorkspaceId)} />
        </span>
      ),
      status: googleStatus[0],
      tone: googleStatus[1],
      node: (
        <div data-plain className="space-y-3">
          {/* Three official Google service connections, all using the shared
              Google Cloud app credentials configured in the system. */}
          <GoogleServiceConnectCard
            platform="gmail"
            title="Gmail"
            hint="שליחה וקבלה של מיילים מהמערכת."
            ctaLabel="חיבור Gmail"
            brand="gmail"
          />
          <GoogleServiceConnectCard
            platform="google_calendar"
            title="Google Calendar"
            hint="סנכרון פגישות וסיורים ליומן."
            ctaLabel="חיבור יומן"
            brand="calendar"
            accountEmail={googleAccountEmail}
          />
          <GoogleServiceConnectCard
            platform="youtube"
            title="YouTube"
            hint="העלאת סרטוני נכסים לערוץ."
            ctaLabel="חיבור יוטיוב"
            brand="youtube"
            accountEmail={googleAccountEmail}
          />
          {isSuperAdmin && (
            <section className="border-t pt-3" style={{ borderTopColor: 'hsl(0 72% 51%)' }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-2 px-1 text-xs text-muted-foreground"
                aria-expanded={googleAdvancedOpen}
                onClick={() => setGoogleAdvancedOpen((open) => !open)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                הגדרות גוגל למתקדמים
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', googleAdvancedOpen && 'rotate-180')} />
              </Button>
              {googleAdvancedOpen && (
                <div data-keep className="mt-3 rounded-lg border p-3" style={{ borderColor: 'hsl(0 72% 51%)' }}>
                  <GoogleApiCredentialsCard />
                </div>
              )}
            </section>
          )}
        </div>
      ),
    },
    // The 019 SMS gateway is a PLATFORM service: every workspace sends OTP/SMS
    // through the global Realtyz 019 number automatically. Only Super Admin may
    // see or override the credentials.
    ...(isSuperAdmin ? [{
      id: 'sms019',
      titleLead: (
        <MessageSquare
          className={cn('h-5 w-5 shrink-0 text-[#1877F2]', !sms019Connected && 'grayscale opacity-40')}
          strokeWidth={2.25}
        />
      ),
      title: 'SMS ',
      titleAside: sms019DisplaySender ? (
        <span className="text-xs font-medium text-muted-foreground" dir="ltr">
          {formatPhoneDisplay(sms019DisplaySender)}
        </span>
      ) : undefined,
      status: sms019BadgeText,
      tone: (sms019Connected ? 'ok' : 'idle') as Tone,
      node: <WorkspaceSmsCard onStatus={(sender) => {
        setSms019Sender(sender);
        void refetchSms019Status();
      }} />,
      restricted: true,
    }] : []),


    // Voice calls and the real-estate portals are platform-level services:
    // only a Super Admin may see or configure them.
    ...(isSuperAdmin ? [{
      id: 'voice',
      title: 'טלפון',
      titleLead: (
        <Phone
          className={cn('h-5 w-5 shrink-0 text-[#0B62F5]', !(voicePhone || voiceReady) && 'grayscale opacity-40')}
          strokeWidth={2.25}
        />
      ),
      status: voicePhone ? formatPhoneDisplay(voicePhone) : voiceReady ? 'מחובר' : 'לא הוגדר',
      tone: (voicePhone || voiceReady ? 'ok' : 'idle') as Tone,
      node: <VoiceGatewayCard />,
      restricted: true,
    }] : []),
    ...(isSuperAdmin ? [{
      id: 'portals',
      title: 'יד2 / הומלי',
      status: '',
      tone: 'idle' as Tone,
      // Portal brand marks replace the settings pill: full color when the
      // portal is connected, grayscale when it is not.
      headerAside: (
        <span className="flex items-center gap-1.5" aria-label="portals">
          <PortalBrandGlyph portal="yad2" connected={portalStatus.yad2} />
          <PortalBrandGlyph portal="homely" connected={portalStatus.homely} />
        </span>
      ),
      node: <ListingPortalsCard />,
      restricted: true,
    }] : []),
  ];

  return (
    <div dir="rtl" className="space-y-3 text-right">
      {sections.map((s) => (
        <ConnectionSection
          key={s.id}
          title={s.title}
          titleAside={s.titleAside}
          titleLead={s.titleLead}
          titleNode={s.titleNode}
          status={s.status}
          tone={s.tone}
          open={openId === s.id}
          onToggle={() => toggle(s.id)}
          headerAside={s.headerAside}
          bodyClassName={s.id === 'whatsapp' ? 'pt-0' : undefined}
          restricted={s.restricted}
        >
          {s.node}
        </ConnectionSection>
      ))}
    </div>
  );
}
