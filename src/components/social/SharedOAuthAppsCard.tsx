import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ChevronDown, KeyRound, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BrandLogo } from './BrandLogo';

/**
 * Shared OAuth Apps — super-admin-only card.
 *
 * Holds a single workspace-wide developer-app credential set per platform
 * (LinkedIn, Meta) so that every end-user can use the One-Click Connect
 * flow without provisioning their own app in LinkedIn / Meta consoles.
 *
 * Credentials live in `platform_oauth_apps` (RLS: super_admin only).
 */

type PlatformKey = 'google' | 'linkedin' | 'meta';

interface PlatformConfig {
  key: PlatformKey;
  brand: string;            // BrandLogo platform key
  title: string;
  subtitle: string;
  consoleLabel: string;
  consoleUrl: string;
  clientIdLabel: string;
  clientSecretLabel: string;
  scopes: string[];
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: 'google',
    brand: 'gmail',
    title: 'Google (Gmail + Drive) — אפליקציית OAuth משותפת',
    subtitle: 'אותו Client ID מאפשר חיבור מהיר ל-Gmail וגם ל-Google Drive בלחיצה אחת',
    consoleLabel: 'Google Cloud Console · Credentials',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    clientIdLabel: 'OAuth Client ID',
    clientSecretLabel: 'OAuth Client Secret',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive.file',
    ],
  },
  {
    key: 'linkedin',
    brand: 'linkedin',
    title: 'LinkedIn — אפליקציית OAuth משותפת',
    subtitle: 'מאפשרת התחברות מהירה בלחיצה אחת לכל המשתמשים',
    consoleLabel: 'LinkedIn Developers · Apps',
    consoleUrl: 'https://www.linkedin.com/developers/apps',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
  },
  {
    key: 'meta',
    brand: 'facebook',
    title: 'Meta (Facebook + Instagram) — אפליקציית OAuth משותפת',
    subtitle: 'אותו App ID של Meta משרת גם פייסבוק וגם אינסטגרם',
    consoleLabel: 'Meta for Developers · App Dashboard',
    consoleUrl: 'https://developers.facebook.com/apps/',
    clientIdLabel: 'App ID',
    clientSecretLabel: 'App Secret',
    scopes: ['public_profile', 'email', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement'],
  },
];

const REDIRECT_URIS = [
  'https://ai.realtyz.co.il/oauth/callback',
  'https://realtyzai.lovable.app/oauth/callback',
];

interface AppRow {
  platform: string;
  client_id: string | null;
  client_secret: string | null;
  updated_at: string;
}

export function SharedOAuthAppsCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['platform_oauth_apps'],
    queryFn: async (): Promise<AppRow[]> => {
      const { data, error } = await supabase
        .from('platform_oauth_apps')
        .select('platform, client_id, client_secret, updated_at');
      if (error) throw error;
      return (data ?? []) as AppRow[];
    },
  });

  const byPlatform = useMemo(() => {
    const m = new Map<string, AppRow>();
    (data ?? []).forEach((r) => m.set(r.platform, r));
    return m;
  }, [data]);

  const configuredCount = (data ?? []).filter(
    (r) => (r.client_id ?? '').trim() && (r.client_secret ?? '').trim(),
  ).length;

  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-muted/30 transition-colors"
          dir="rtl"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-md bg-primary/10 border border-primary/20 p-1.5 shrink-0">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="text-right min-w-0">
              <p className="text-[13px] font-semibold leading-tight">
                אישורי OAuth משותפים (Super Admin)
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Google · LinkedIn · Meta — התחברות מהירה לכל המשתמשים בלחיצה אחת
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={configuredCount === PLATFORMS.length ? 'default' : 'outline'} className="text-[10px]">
              {configuredCount}/{PLATFORMS.length} מוגדרים
            </Badge>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </button>

        {open && (
          <div className="border-t border-border/50 px-4 py-3 space-y-3" dir="rtl">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <RedirectUrisStrip />
                {PLATFORMS.map((p) => (
                  <PlatformRow
                    key={p.key}
                    config={p}
                    row={byPlatform.get(p.key)}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ['platform_oauth_apps'] });
                      refetch();
                    }}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RedirectUrisStrip() {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">
        Authorized Redirect URIs (להזין בקונסולה של הספק):
      </p>
      <div className="space-y-1">
        {REDIRECT_URIS.map((uri) => (
          <div key={uri} className="flex items-center gap-1.5">
            <code dir="ltr" className="flex-1 text-[11px] font-mono bg-background/60 border border-border/40 rounded px-2 py-1 truncate">
              {uri}
            </code>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(uri);
                toast.success('הועתק', { description: uri });
              }}
              aria-label={`העתק ${uri}`}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PlatformRowProps {
  config: PlatformConfig;
  row?: AppRow;
  onSaved: () => void;
}

function PlatformRow({ config, row, onSaved }: PlatformRowProps) {
  const [clientId, setClientId] = useState(row?.client_id ?? '');
  const [clientSecret, setClientSecret] = useState(row?.client_secret ?? '');
  const [saving, setSaving] = useState(false);

  // Re-sync if external row changes (e.g., after invalidation).
  useEffect(() => {
    setClientId(row?.client_id ?? '');
    setClientSecret(row?.client_secret ?? '');
  }, [row?.client_id, row?.client_secret]);

  const dirty =
    (clientId ?? '').trim() !== (row?.client_id ?? '').trim() ||
    (clientSecret ?? '').trim() !== (row?.client_secret ?? '').trim();

  const configured = !!(row?.client_id?.trim() && row?.client_secret?.trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        platform: config.key,
        client_id: clientId.trim() || null,
        client_secret: clientSecret.trim() || null,
        updated_by: userRes.user?.id ?? null,
      };
      const { error } = await supabase
        .from('platform_oauth_apps')
        .upsert(payload, { onConflict: 'platform' });
      if (error) throw error;
      toast.success('נשמר', { description: config.title });
      onSaved();
    } catch (e: any) {
      toast.error('שמירה נכשלה', { description: e?.message ?? 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_oauth_apps')
        .delete()
        .eq('platform', config.key);
      if (error) throw error;
      setClientId('');
      setClientSecret('');
      toast.success('נמחק', { description: config.title });
      onSaved();
    } catch (e: any) {
      toast.error('המחיקה נכשלה', { description: e?.message ?? 'Unknown error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="rounded-md bg-muted/40 border border-border/40 p-1.5 shrink-0">
          <BrandLogo platform={config.brand} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-semibold leading-tight">{config.title}</p>
            {configured && (
              <Badge className="text-[9px] h-4 px-1.5 bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600">
                פעיל
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            {config.subtitle}
          </p>
        </div>
        <a
          href={config.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-1 shrink-0"
        >
          <ExternalLink className="h-3 w-3" />
          קונסולה
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{config.clientIdLabel}</Label>
          <Input
            dir="ltr"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={
              config.key === 'linkedin'
                ? '77abc12345xyz'
                : config.key === 'google'
                  ? 'xxxxxxxx.apps.googleusercontent.com'
                  : '1234567890123456'
            }
            className="h-8 text-[12px] font-mono"
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{config.clientSecretLabel}</Label>
          <Input
            dir="ltr"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="••••••••••••••••"
            className="h-8 text-[12px] font-mono"
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="text-[10px] text-muted-foreground truncate">
          Scopes: <span dir="ltr" className="font-mono">{config.scopes.join(' ')}</span>
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {configured && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleClear}
              disabled={saving}
            >
              מחק
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-[11px]"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <KeyRound className="h-3 w-3 ml-1" />
                שמור
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
