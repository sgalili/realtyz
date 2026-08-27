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
import { MetaDirectConnectionCard, type MetaStatus } from '@/components/profile/MetaDirectConnectionCard';
import { useFacebookHealth } from '@/hooks/useFacebookHealth';

type Tone = 'ok' | 'idle';

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        tone === 'ok'
          ? 'border-transparent bg-emerald-600 text-white'
          : 'border-border bg-muted text-muted-foreground',
      )}
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
      return new URLSearchParams(window.location.search).has('fb') ? 'meta' : null;
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
      id: 'wa-mode',
      title: 'אופן חיבור WhatsApp',
      status: waMode === 'qr_session' ? 'מספר אישי (QR)' : waMode === 'official_meta' ? 'מספר רשמי (Meta)' : 'לא הוגדר',
      tone: waMode ? 'ok' : 'idle',
      node: <WhatsAppConnectionModeCard />,
    },
    {
      id: 'wa-green',
      title: 'WhatsApp · מספר אישי (Green API)',
      status: greenReady ? 'מוגדר' : 'לא מוגדר',
      tone: greenReady ? 'ok' : 'idle',
      node: <WhatsAppGatewayCard />,
    },
    {
      id: 'voice',
      title: 'שיחות טלפון (Vapi / Twilio)',
      status: voiceReady ? 'מוגדר' : 'לא מוגדר',
      tone: voiceReady ? 'ok' : 'idle',
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
