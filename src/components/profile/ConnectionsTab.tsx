import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
import { MetaWhatsAppAuthCard } from '@/components/settings/MetaWhatsAppAuthCard';
import { WorkspaceSmsCard } from '@/components/profile/WorkspaceSmsCard';
import { GoogleApiCredentialsCard } from '@/components/profile/GoogleApiCredentialsCard';
import { GoogleServiceConnectCard } from '@/components/profile/GoogleServiceConnectCard';
import { useUserRole } from '@/hooks/useUserRole';
import { useAccountIntegrations } from '@/hooks/useAccountIntegrations';

type Tone = 'ok' | 'idle';

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  // Inline styles on purpose: global CSS neutralizes utility color classes
  // (bg-emerald/bg-slate...) with !important, which washed these pills out.
  const style = tone === 'ok'
    ? { backgroundColor: 'hsl(152 62% 30%)', color: '#ffffff', borderColor: 'hsl(152 62% 24%)' }
    : { backgroundColor: 'hsl(215 28% 95%)', color: 'hsl(217 45% 22%)', borderColor: 'hsl(215 20% 78%)' };
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
function ConnectionSection({
  title,
  status,
  tone,
  open,
  onToggle,
  children,
}: {
  title: string;
  status: string;
  tone: Tone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div dir="rtl" className="rounded-xl border bg-card text-right shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-right"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <span className="truncate text-sm font-semibold">{title}</span>
        </span>
        <StatusPill label={status} tone={tone} />
      </button>
      {open && (
        <div
          className={cn(
            'border-t px-1 pb-1 pt-[10px] text-right',
            // neutralize the nested Card chrome + hide its duplicate header
            '[&_[data-conn-body]>div:not([data-plain])]:border-0 [&_[data-conn-body]>div:not([data-plain])]:bg-transparent [&_[data-conn-body]>div:not([data-plain])]:shadow-none',
            '[&_[data-conn-body]>div:not([data-plain])>:first-child]:hidden',
            // grouped sections (e.g. all WhatsApp accounts in one card):
            // neutralize each nested card one level deeper instead
            '[&_[data-plain]>section>div]:border-0 [&_[data-plain]>section>div]:bg-transparent [&_[data-plain]>section>div]:shadow-none',
            '[&_[data-plain]>section>div>:first-child]:hidden',
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
  const { data: fbHealth } = useFacebookHealth();
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

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  // Live Google service statuses so the collapsed "חשבונות גוגל" header matches
  // the individual cards and reflects the combined auto-link result instantly.
  const { data: googleConns } = useQuery({
    queryKey: ['google-services-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('social_connections')
        .select('platform, is_connected, credentials')
        .in('platform', ['gmail', 'google_calendar', 'youtube']);
      return (data ?? []) as { platform: string; is_connected: boolean; credentials: any }[];
    },
  });
  const liveGoogle = (googleConns ?? []).filter((c) => c.is_connected);
  const connectedGoogle = new Set(liveGoogle.map((c) => c.platform));
  
  const someGoogleConnected = connectedGoogle.size > 0;
  // Never show a vague "חלקי": the header shows the actual connected Google
  // account (email / name) so the broker sees exactly which account is live.
  const googleAccount = liveGoogle
    .map((c) => String(c.credentials?.verified_identity?.email ?? c.credentials?.verified_identity?.name ?? '').trim())
    .find((v) => !!v) ?? null;
  const googleStatus: [string, Tone] = someGoogleConnected
    ? [googleAccount ?? 'מחובר', 'ok']
    : ['לא מחובר', 'idle'];


  // Collapsed header badge reads the exact same shared state as the expanded
  // card badge and the global banner. Facebook / Instagram are strictly
  // workspace-scoped: never fall back to another workspace's binding.
  const fbConnected = !!(fbHealth?.pageConnected || meta?.connected);
  const metaStatus: [string, Tone] = fbConnected ? ['מחובר', 'ok'] : ['מנותק', 'idle'];

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

  const sections: Array<{ id: string; title: string; status: string; tone: Tone; node: ReactNode }> = [
    {
      id: 'meta',
      title: 'פייסבוק / אינסטגרם',
      status: metaStatus[0],
      tone: metaStatus[1],
      node: <MetaDirectConnectionCard onStatus={setMeta} />,
    },
    {
      id: 'whatsapp',
      title: 'חשבונות ווטסאפ',
      status: waStatus[0],
      tone: waStatus[1],
      node: (
        <div data-plain className="space-y-4">
          {officialPhone ? (
            // A Meta WBA number is live — the whole Cloud API setup block is
            // irrelevant, so show a compact confirmation row instead.
            <section className="space-y-1">
              <h4 className="text-sm font-semibold">
                WhatsApp רשמי (Meta Cloud API)
                <span className="ms-2 text-xs font-normal text-muted-foreground" dir="ltr">
                  {formatPhoneDisplay(officialPhone)}
                </span>
              </h4>
              <p className="text-xs text-muted-foreground">המספר הרשמי מחובר ומאושר מול Meta.</p>
            </section>
          ) : (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">WhatsApp רשמי (Meta Cloud API)</h4>
              <MetaWhatsAppAuthCard />
            </section>
          )}
          <section className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-semibold">אופן חיבור WhatsApp</h4>
            <WhatsAppConnectionModeCard />
          </section>
          <section className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-semibold">
              מספר אישי (Green API)
              {personalPhone && (
                <span className="ms-2 text-xs font-normal text-muted-foreground" dir="ltr">
                  {formatPhoneDisplay(personalPhone)}
                </span>
              )}
            </h4>
            <WhatsAppGatewayCard />
          </section>
        </div>
      ),
    },
    {
      id: 'google',
      title: 'חשבונות גוגל',
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
          />
          <GoogleServiceConnectCard
            platform="youtube"
            title="YouTube"
            hint="העלאת סרטוני נכסים לערוץ."
            ctaLabel="חיבור יוטיוב"
            brand="youtube"
          />
          {isSuperAdmin && (
            <section className="border-t pt-3">
              <GoogleApiCredentialsCard />
            </section>
          )}
        </div>
      ),

    },
    {
      id: 'sms019',
      title: 'SMS (019) של מרחב העבודה',
      status: sms019Sender ? sms019Sender : 'לא הוגדר',
      tone: sms019Sender ? 'ok' : 'idle',
      node: <WorkspaceSmsCard onStatus={setSms019Sender} />,
    },
    {
      id: 'voice',
      title: 'שיחות טלפון (Vapi / Twilio)',
      status: voicePhone ? formatPhoneDisplay(voicePhone) : voiceReady ? 'מחובר' : 'לא הוגדר',
      tone: voicePhone || voiceReady ? 'ok' : 'idle',
      node: <VoiceGatewayCard />,
    },
    {
      id: 'portals',
      title: 'פורטלי נדל"ן',
      status: 'הגדרות',
      tone: 'idle',
      node: <ListingPortalsCard />,
    },
  ];

  return (
    <div dir="rtl" className="space-y-3 text-right">
      {sections.map((s) => (
        <ConnectionSection
          key={s.id}
          title={s.title}
          status={s.status}
          tone={s.tone}
          open={openId === s.id}
          onToggle={() => toggle(s.id)}
        >
          {s.node}
        </ConnectionSection>
      ))}
    </div>
  );
}
