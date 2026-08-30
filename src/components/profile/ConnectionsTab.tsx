import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { WhatsAppConnectionModeCard } from '@/components/settings/WhatsAppConnectionModeCard';
import { WhatsAppGatewayCard } from '@/components/profile/WhatsAppGatewayCard';
import { VoiceGatewayCard } from '@/components/profile/VoiceGatewayCard';
import { EmailAliasCard } from '@/components/profile/EmailAliasCard';
import { ListingPortalsCard } from '@/components/profile/ListingPortalsCard';
import { CalendarSyncCard } from '@/components/profile/CalendarSyncCard';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { MetaDirectConnectionCard, type MetaStatus } from '@/components/profile/MetaDirectConnectionCard';
import { useFacebookHealth } from '@/hooks/useFacebookHealth';
import { MetaWhatsAppAuthCard } from '@/components/settings/MetaWhatsAppAuthCard';
import { GoogleApiCredentialsCard } from '@/components/profile/GoogleApiCredentialsCard';
import { GoogleServiceConnectCard } from '@/components/profile/GoogleServiceConnectCard';
import { useUserRole } from '@/hooks/useUserRole';

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
            '[&_[data-conn-body]>div]:border-0 [&_[data-conn-body]>div]:bg-transparent [&_[data-conn-body]>div]:shadow-none',
            '[&_[data-conn-body]>div>:first-child]:hidden',
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
      if (target === 'whatsapp-meta' || target === 'whatsapp') return 'wa-meta';
      return null;
    } catch {
      return null;
    }
  });
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [waMode, setWaMode] = useState<string | null>(null);
  const [greenReady, setGreenReady] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [emailAlias, setEmailAlias] = useState<string | null>(null);
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
        if (user) {
          const { data: p } = await supabase.from('profiles').select('email_alias').eq('id', user.id).maybeSingle();
          setEmailAlias(((p as any)?.email_alias as string) || null);
        }
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

  // Collapsed header badge reads the exact same shared state as the expanded
  // card badge and the global banner. Status only — never the page name.
  const fbConnected = !!(fbHealth?.pageConnected || meta?.connected);
  const metaStatus: [string, Tone] = fbConnected ? ['מחובר', 'ok'] : ['מנותק', 'idle'];

  const sections: Array<{ id: string; title: string; status: string; tone: Tone; node: ReactNode }> = [
    {
      id: 'meta',
      title: 'פייסבוק / אינסטגרם',
      status: metaStatus[0],
      tone: metaStatus[1],
      node: <MetaDirectConnectionCard onStatus={setMeta} />,
    },
    {
      id: 'wa-meta',
      title: 'WhatsApp רשמי (Meta Cloud API)',
      status: waPhone ? formatPhoneDisplay(waPhone) : 'לא מחובר',
      tone: waPhone ? 'ok' : 'idle',
      node: <MetaWhatsAppAuthCard />,
    },
    {
      id: 'wa-mode',
      title: 'אופן חיבור WhatsApp',
      status: waPhone ? formatPhoneDisplay(waPhone) : waMode ? 'מספר רשמי (Meta)' : 'לא הוגדר',
      tone: waPhone || waMode ? 'ok' : 'idle',
      node: <WhatsAppConnectionModeCard />,
    },
    {
      id: 'wa-green',
      title: 'WhatsApp · מספר אישי (Green API)',
      status: greenPhone ? formatPhoneDisplay(greenPhone) : greenReady ? 'מחובר' : 'לא הוגדר',
      tone: greenPhone || greenReady ? 'ok' : 'idle',
      node: <WhatsAppGatewayCard />,
    },
    {
      id: 'voice',
      title: 'שיחות טלפון (Vapi / Twilio)',
      status: voicePhone ? formatPhoneDisplay(voicePhone) : voiceReady ? 'מחובר' : 'לא הוגדר',
      tone: voicePhone || voiceReady ? 'ok' : 'idle',
      node: <VoiceGatewayCard />,
    },
    {
      id: 'email',
      title: 'כתובת מייל מותגת',
      status: emailAlias ? `${emailAlias}@realtyz.co.il` : 'לא הוגדר',
      tone: emailAlias ? 'ok' : 'idle',
      node: <EmailAliasCard />,
    },
    {
      id: 'calendar',
      title: 'יומן Google',
      status: 'סנכרון',
      tone: 'idle',
      node: <CalendarSyncCard />,
    },
    ...(isSuperAdmin
      ? [{
          id: 'google-admin',
          title: 'Google API גלובלי (Gmail + יומן) · סופר-אדמין',
          status: 'ניהול',
          tone: 'idle' as Tone,
          node: (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                חיבור חשבון Google הגלובלי של הפלטפורמה. משמש לשליחת מיילים וסנכרון יומן עבור כל חשבונות העבודה.
              </p>
              <GoogleApiCredentialsCard />
              <GoogleServiceConnectCard
                platform="gmail"
                title="Gmail (שליחה וקבלה)"
                hint="חיבור תיבת Gmail הגלובלית לשליחה וקבלה של מיילים."
              />
              <GoogleServiceConnectCard
                platform="google_calendar"
                title="Google Calendar"
                hint="סנכרון פגישות וסיורים ליומן Google."
              />
            </div>
          ),
        }]
      : []),
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
