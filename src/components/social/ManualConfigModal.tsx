import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, ChevronDown, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SocialAutomationService, OAUTH_SCOPES } from '@/lib/socialAutomationService';
import { BrandLogo } from './BrandLogo';
import { OAUTH_AUTHORIZE_URLS } from '@/lib/socialAutomationService';
import { SHARED_OAUTH_PLATFORM_MAP, ONE_CLICK_SUPPORTED_PLATFORMS } from '@/lib/socialAutomationService';

/**
 * All origins where this app may run. Used to populate Google/Meta/X
 * OAuth console fields. Order: current origin first, then known production
 * domains, deduped.
 *
 * Keep this list in sync with deployed environments.
 */
const KNOWN_ORIGINS = [
  'https://ai.realtyz.co.il',
  'https://realtyzai.lovable.app',
];

const REDIRECT_PATH = '/oauth/callback';

/** Official Google "G" logo (multi-color). Inline SVG keeps the brand intact. */
function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function buildOAuthUrls(): { origins: string[]; redirects: string[] } {
  const current = typeof window !== 'undefined' ? window.location.origin : '';
  const set = new Set<string>();
  if (current) set.add(current);
  for (const o of KNOWN_ORIGINS) set.add(o);
  const origins = Array.from(set);
  const redirects = origins.map((o) => `${o}${REDIRECT_PATH}`);
  return { origins, redirects };
}

/**
 * Direct deep-link to the exact OAuth credentials page in each provider's
 * developer console. Used by the Manual Config modal so the user lands
 * straight on the screen where the Authorized Origins / Redirect URIs go.
 */
const PROVIDER_CONSOLE: Record<string, { label: string; url: string }> = {
  gmail:          { label: 'Google Cloud Console · Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
  youtube:        { label: 'Google Cloud Console · Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
  google_drive:   { label: 'Google Cloud Console · Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
  facebook:       { label: 'Meta for Developers · App Dashboard', url: 'https://developers.facebook.com/apps/' },
  instagram:      { label: 'Meta for Developers · Instagram Basic Display', url: 'https://developers.facebook.com/apps/' },
  x:              { label: 'X Developer Portal · Projects & Apps',  url: 'https://developer.x.com/en/portal/projects-and-apps' },
  tiktok:         { label: 'TikTok for Developers · Manage Apps',   url: 'https://developers.tiktok.com/apps/' },
  linkedin:       { label: 'LinkedIn Developers · Apps',           url: 'https://www.linkedin.com/developers/apps' },
  whatsapp_green: { label: 'WBA · Console',                        url: 'https://console.green-api.com/' },
  whatsapp_wba:   { label: 'WBA רשמי · Meta for Developers',       url: 'https://developers.facebook.com/apps/' },
  telegram:       { label: 'Telegram BotFather',                   url: 'https://t.me/BotFather' },
};


export interface ManualField {
  key: string;
  label: string;
  type?: 'text' | 'password';
  placeholder?: string;
  hint?: string;
}

interface PlatformManualSpec {
  /** Whether manual API-key entry is genuinely safer/required for this provider. */
  showApiKeyOption: boolean;
  /** Helper headline shown above the API-key inputs. */
  apiHeadline?: string;
  /** Manual config fields. */
  fields: ManualField[];
  /** Where to get credentials. */
  docsUrl?: string;
  /** OAuth client_id input is also offered (BYOK OAuth). */
  byokOauth?: boolean;
}

/**
 * Per-platform manual config policy.
 *
 * Rule (per product spec):
 *   "Only show 'Input API Key' if it provides a Safer/Better Experience
 *    (e.g. WhatsApp Official or X Enterprise). For Gmail/YouTube keep
 *    OAuth-only unless a Service Account is required."
 */
const SPEC: Record<string, PlatformManualSpec> = {
  // --- API key path is the SAFER path here ---
  whatsapp_green: {
    showApiKeyOption: true,
    apiHeadline: 'WBA · יציב יותר משכפול QR לטווח ארוך',
    docsUrl: 'https://green-api.com/en/docs/',
    fields: [
      { key: 'instance_id', label: 'Instance ID', placeholder: '1101000123' },
      { key: 'api_token',   label: 'API Token',   type: 'password', placeholder: 'xxxxxxxxxxxx' },
    ],
  },
  whatsapp_wba: {
    showApiKeyOption: true,
    apiHeadline: 'WhatsApp Business API · מומלץ לשליחה מאסיבית',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '1234567890' },
      { key: 'access_token',    label: 'Permanent Access Token', type: 'password' },
      { key: 'business_id',     label: 'WhatsApp Business Account ID', placeholder: 'optional' },
    ],
  },
  x: {
    showApiKeyOption: true,
    apiHeadline: 'X Enterprise / API v2 · נדרש לחשבונות עסקיים',
    docsUrl: 'https://developer.x.com/en/portal/projects-and-apps',
    byokOauth: true,
    fields: [
      { key: 'consumer_key',        label: 'Consumer Key (API Key)',     type: 'password' },
      { key: 'consumer_secret',     label: 'Consumer Secret',            type: 'password' },
      { key: 'access_token',        label: 'Access Token',               type: 'password' },
      { key: 'access_token_secret', label: 'Access Token Secret',        type: 'password' },
    ],
  },

  // --- OAuth-only platforms (API key would be LESS safe) ---
  gmail: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'oauth_client_id',     label: 'OAuth Client ID',     placeholder: 'xxxxxxxx.apps.googleusercontent.com', hint: 'Google Workspace · Web application' },
      { key: 'oauth_client_secret', label: 'OAuth Client Secret', type: 'password' },
      { key: 'workspace_domain',    label: 'דומיין Workspace (אופציונלי)', placeholder: 'example.com', hint: 'מגביל התחברות לדומיין מסוים (hd=)' },
    ],
  },
  youtube: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'oauth_client_id',     label: 'OAuth Client ID' },
      { key: 'oauth_client_secret', label: 'OAuth Client Secret', type: 'password' },
    ],
  },
  facebook: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://developers.facebook.com/apps',
    fields: [
      { key: 'oauth_client_id',     label: 'App ID' },
      { key: 'oauth_client_secret', label: 'App Secret', type: 'password' },
    ],
  },
  instagram: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://developers.facebook.com/docs/instagram-api',
    fields: [
      { key: 'oauth_client_id',     label: 'Instagram App ID' },
      { key: 'oauth_client_secret', label: 'Instagram App Secret', type: 'password' },
    ],
  },
  tiktok: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://developers.tiktok.com/apps/',
    fields: [
      { key: 'oauth_client_id',     label: 'TikTok Client Key',    placeholder: 'awxxxxxxxxxxxxxx' },
      { key: 'oauth_client_secret', label: 'TikTok Client Secret', type: 'password' },
    ],
  },

  linkedin: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://www.linkedin.com/developers/apps',
    fields: [
      { key: 'oauth_client_id',     label: 'LinkedIn Client ID',     placeholder: '77xxxxxxxxxx' },
      { key: 'oauth_client_secret', label: 'LinkedIn Client Secret', type: 'password' },
    ],
  },
  google_drive: {
    showApiKeyOption: false,
    byokOauth: true,
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'oauth_client_id',     label: 'OAuth Client ID',     placeholder: 'xxxxxxxx.apps.googleusercontent.com' },
      { key: 'oauth_client_secret', label: 'OAuth Client Secret', type: 'password' },
    ],
  },

  telegram: {
    showApiKeyOption: true,
    apiHeadline: 'Bot Token · עדיף על QR לבוטים',
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    fields: [
      { key: 'bot_token', label: 'Bot Token (BotFather)', type: 'password', placeholder: '123456:ABC-DEF...' },
    ],
  },
  signal: {
    showApiKeyOption: false,
    docsUrl: 'https://signal.org/docs/',
    fields: [],
  },
};

interface Props {
  open: boolean;
  platform: string;
  displayName: string;
  isConnected: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ManualConfigModal({ open, platform, displayName, isConnected, onOpenChange, onSaved }: Props) {
  const spec = SPEC[platform] ?? { showApiKeyOption: false, fields: [] };
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [verifiedIdentity, setVerifiedIdentity] = useState<{
    account_name?: string;
    email?: string;
    channel_title?: string;
    subscriber_count?: number;
    verified_at?: string;
  } | null>(null);
  const [lastTest, setLastTest] = useState<{ status?: string | null; message?: string | null } | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmMetaClearOpen, setConfirmMetaClearOpen] = useState(false);
  const [verifyingCreds, setVerifyingCreds] = useState(false);
  const [credsCheck, setCredsCheck] = useState<{
    ok: boolean;
    status: string;
    message: string;
    checked_at?: string;
  } | null>(null);

  const isGoogle = platform === 'gmail' || platform === 'youtube' || platform === 'google_drive';
  const isLinkedIn = platform === 'linkedin';
  const isMeta = platform === 'facebook' || platform === 'instagram';
  const sharedOauthPlatform = SHARED_OAUTH_PLATFORM_MAP[platform];
  const supportsOneClick = ONE_CLICK_SUPPORTED_PLATFORMS.has(platform);
  const [verifyingLi, setVerifyingLi] = useState(false);
  const [liCheck, setLiCheck] = useState<{
    ok: boolean;
    status: string;
    message: string;
    identity?: { name?: string; email?: string };
    checked_at?: string;
  } | null>(null);

  const handleVerifyLinkedIn = async (): Promise<boolean> => {
    setVerifyingLi(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-linkedin-credentials', { body: {} });
      if (error) throw error;
      const ok = !!data?.ok;
      setLiCheck({
        ok,
        status: data?.status ?? 'unknown',
        message: data?.message ?? '',
        identity: data?.identity,
        checked_at: data?.checked_at,
      });
      if (ok) toast.success(data.message ?? 'ה-Token תקין');
      else toast.error(data?.message ?? 'בדיקה נכשלה');
      onSaved();
      return ok;
    } catch (e: any) {
      const msg = e?.message ?? 'בדיקה נכשלה';
      setLiCheck({ ok: false, status: 'unknown', message: msg });
      toast.error(msg);
      return false;
    } finally {
      setVerifyingLi(false);
    }
  };

  const oauthUrls = useMemo(() => buildOAuthUrls(), [open]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success('הועתק ללוח');
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast.error('העתקה נכשלה');
    }
  };

  const copyAll = async (values: string[], key: string) => {
    await copy(values.join('\n'), key);
  };

  const handleClearGoogleConfig = async () => {
    setClearing(true);
    try {
      await SocialAutomationService.clearGoogleConfig();
      toast.success('הגדרות Google נמחקו מכל השירותים', {
        description: 'Gmail · YouTube · Google Drive · נדרשת הזנה מחדש של Client ID ו-Secret',
      });
      // Reset local form state immediately.
      setValues((v) => ({
        ...v,
        oauth_client_id: '',
        oauth_client_secret: '',
        workspace_domain: '',
      }));
      setGoogleSynced(false);
      setVerifiedIdentity(null);
      setLastTest({ status: 'disconnected', message: 'Google configuration cleared by user' });
      setConfirmClearOpen(false);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'מחיקת הגדרות Google נכשלה');
    } finally {
      setClearing(false);
    }
  };

  /**
   * Generic clear for non-Google platforms. For Meta/Facebook + Instagram we
   * ask whether to cascade-clear the sibling (they typically share a Meta App).
   */
  const handleClearPlatformConfig = async (cascadeMeta: boolean) => {
    setClearing(true);
    try {
      const targets: string[] = [platform];
      if (platform === 'facebook' && cascadeMeta) targets.push('instagram');
      if (platform === 'instagram' && cascadeMeta) targets.push('facebook');
      await SocialAutomationService.clearPlatformConfig(targets);
      toast.success('הגדרות נמחקו', {
        description: targets.length > 1
          ? `נמחקו עבור: ${targets.join(', ')} · נדרשת הזנה מחדש`
          : `נמחקו עבור ${displayName} · נדרשת הזנה מחדש`,
      });
      setValues((v) => ({ ...v, oauth_client_id: '', oauth_client_secret: '' }));
      setVerifiedIdentity(null);
      setLastTest({ status: 'disconnected', message: 'Configuration cleared by user' });
      setConfirmMetaClearOpen(false);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'מחיקת הגדרות נכשלה');
    } finally {
      setClearing(false);
    }
  };


  // Google service (Gmail / YouTube / Drive share the same Cloud project).
  const [googleSynced, setGoogleSynced] = useState(false);

  // Hydrate previously-saved config + last verification from the row.
  // For Google services (Gmail/YouTube/Drive), if THIS row has no
  // oauth_client_id yet, look up any sibling Google row that already has one
  // and pre-fill the form so the user only configures Google credentials once.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('social_connections')
        .select('credentials, last_test_status, last_test_message')
        .eq('platform', platform)
        .maybeSingle();
      if (cancelled) return;
      const creds = (data?.credentials as any) ?? {};
      const manual = (creds.manual ?? {}) as Record<string, string>;
      const seed: Record<string, string> = {};
      for (const f of spec.fields) seed[f.key] = manual[f.key] ?? '';

      let synced = manual.google_sync_source === 'shared' && !!manual.oauth_client_id;

      // Auto-Sync: if this Google service has no OAuth creds yet, borrow
      // them from a sibling (Gmail/YouTube/Drive) that does.
      const isGoog = platform === 'gmail' || platform === 'youtube' || platform === 'google_drive';
      if (isGoog && !manual.oauth_client_id) {
        const siblings = ['gmail', 'youtube', 'google_drive'].filter((p) => p !== platform);
        const { data: sibs } = await supabase
          .from('social_connections')
          .select('platform, credentials')
          .in('platform', siblings);
        const donor = (sibs ?? [])
          .map((s: any) => ({ p: s.platform, m: (s.credentials?.manual ?? {}) as Record<string, string> }))
          .find((s) => !!s.m.oauth_client_id);
        if (donor) {
          if ('oauth_client_id' in seed)     seed.oauth_client_id     = donor.m.oauth_client_id ?? '';
          if ('oauth_client_secret' in seed) seed.oauth_client_secret = donor.m.oauth_client_secret ?? '';
          if ('workspace_domain' in seed && donor.m.workspace_domain) {
            seed.workspace_domain = donor.m.workspace_domain;
          }
          synced = true;
        }
      }

      setValues(seed);
      setGoogleSynced(synced);
      setVerifiedIdentity(creds.verified_identity ?? null);
      setLastTest({ status: data?.last_test_status, message: data?.last_test_message });
      setCredsCheck((creds as any).credentials_check ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await SocialAutomationService.persistManualConfig({
        platform,
        displayName,
        config: values,
      });
      toast.success('הגדרות נשמרו');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      // Bumps connected_at + last_test_at to "force-refresh" the live indicator.
      const { error } = await supabase
        .from('social_connections')
        .update({
          connected_at: new Date().toISOString(),
          last_test_at: new Date().toISOString(),
          last_test_status: 'ok',
          last_test_message: 'Token refreshed',
        })
        .eq('platform', platform);
      if (error) throw error;
      toast.success('הטוקן רוענן');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'רענון טוקן נכשל');
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Calls the verify-google-identity edge function which hits the real
   * Google API with the saved credentials and writes back the actual
   * identity (email / channel + subs) into social_connections.credentials.
   */
  const handleVerifyIdentity = async (): Promise<boolean> => {
    setVerifying(true);
    try {
      // Persist any unsaved field edits first so the function reads them.
      await SocialAutomationService.persistManualConfig({ platform, displayName, config: values });
      const { data, error } = await supabase.functions.invoke('verify-google-identity', {
        body: { platform },
      });
      if (error) throw error;
      if (!data?.ok) {
        const msg = data?.error ?? 'אימות נכשל';
        setLastTest({ status: 'auth_failed', message: msg });
        toast.error(msg);
        return false;
      }
      setVerifiedIdentity(data.identity);
      setLastTest({ status: 'ok', message: 'Identity verified' });
      toast.success(
        platform === 'gmail'
          ? `מחובר כ-${data.identity.email}`
          : platform === 'youtube'
            ? `מחובר לערוץ ${data.identity.channel_title}`
            : `Google Drive · ${data.identity.email ?? 'מחובר'}`,
      );
      onSaved();
      return true;
    } catch (e: any) {
      const msg = e?.message ?? 'אימות נכשל';
      setLastTest({ status: 'auth_failed', message: msg });
      toast.error(msg);
      return false;
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Dry-run verification of OAuth Client ID + Client Secret against Google's
   * token endpoint (no user OAuth flow needed). Calls the
   * `verify-google-credentials` edge function which interprets Google's
   * error codes:
   *   invalid_client → bad credentials
   *   invalid_grant / invalid_request → credentials valid (only the bogus
   *                                     code we sent was rejected)
   */
  const handleVerifyCredentials = async (): Promise<boolean> => {
    setVerifyingCreds(true);
    try {
      if (values.oauth_client_id || values.oauth_client_secret) {
        await SocialAutomationService.persistManualConfig({ platform, displayName, config: values });
      }
      const { data, error } = await supabase.functions.invoke('verify-google-credentials', {
        body: {
          platform,
          client_id: values.oauth_client_id,
          client_secret: values.oauth_client_secret,
        },
      });
      if (error) throw error;
      const ok = !!data?.ok;
      setCredsCheck({
        ok,
        status: data?.status ?? 'unknown',
        message: data?.message ?? '',
        checked_at: data?.checked_at,
      });
      if (ok) toast.success(data.message ?? 'הפרטים תקפים');
      else toast.error(data?.message ?? 'הפרטים שגויים');
      onSaved();
      return ok;
    } catch (e: any) {
      const msg = e?.message ?? 'בדיקה נכשלה';
      setCredsCheck({ ok: false, status: 'unknown', message: msg });
      toast.error(msg);
      return false;
    } finally {
      setVerifyingCreds(false);
    }
  };

  /**
   * Generic connection test for any social platform — calls the
   * `test-social-connection` edge function with the currently entered
   * credentials. Writes the result back into local state so the modal
   * shows success/failure inline (and updates the row's last_test_*).
   */
  const [testing, setTesting] = useState(false);
  const handleTestConnection = async (): Promise<boolean> => {
    setTesting(true);
    try {
      await SocialAutomationService.persistManualConfig({ platform, displayName, config: values });
      const { data, error } = await supabase.functions.invoke('test-social-connection', {
        body: { platform, credentials: values },
      });
      if (error) {
        const networkMsg = `NETWORK: לא ניתן להגיע ל-Edge Function (${error.message ?? 'CORS/Timeout'})`;
        setLastTest({ status: 'failed', message: networkMsg });
        toast.error(networkMsg);
        return false;
      }
      const ok = !!data?.success;
      const state: string | undefined = data?.state;
      const errorType: string | undefined = data?.errorType;
      const msg = data?.message ?? (ok ? 'החיבור תקין' : 'בדיקה נכשלה');

      const uiStatus: 'ok' | 'failed' | 'pending' =
        ok ? 'ok' : (errorType === 'PENDING' ? 'pending' : 'failed');
      setLastTest({ status: uiStatus, message: msg });

      await supabase
        .from('social_connections')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: uiStatus === 'ok' ? 'ok' : (uiStatus === 'pending' ? 'pending' : 'failed'),
          last_test_message: msg,
          ...(platform === 'whatsapp_green' ? { is_connected: ok && state === 'authorized' } : {}),
        })
        .eq('platform', platform);

      if (ok) toast.success(msg);
      else if (uiStatus === 'pending') toast.warning(msg);
      else toast.error(msg);
      onSaved();
      return ok;
    } catch (e: any) {
      const msg = e?.message ?? 'בדיקת חיבור נכשלה';
      setLastTest({ status: 'failed', message: msg });
      toast.error(msg);
      return false;
    } finally {
      setTesting(false);
    }
  };

  const oauthScopes = OAUTH_SCOPES[platform] ?? [];

  // Memoized status tone — derived purely from state, won't trigger re-render loops.
  const statusTone = useMemo<'ok' | 'pending' | 'failed' | null>(() => {
    if (lastTest?.status === 'ok') return 'ok';
    if (lastTest?.status === 'pending') return 'pending';
    if (lastTest?.status && lastTest.status !== 'ok') return 'failed';
    if (credsCheck) return credsCheck.ok ? 'ok' : 'failed';
    if (liCheck) return liCheck.ok ? 'ok' : 'failed';
    if (verifiedIdentity) return 'ok';
    return null;
  }, [lastTest, credsCheck, liCheck, verifiedIdentity]);

  // Auto-close DISABLED. The modal must remain stable and only close when the
  // user clicks Cancel/X or completes a Verify action successfully. Do NOT
  // re-introduce a useEffect that closes based on statusTone — it caused a
  // re-render loop that crashed the popup ~2s after open.

  const verifying_any = verifying || verifyingCreds || verifyingLi || testing;

  // Unified "Verify & Sync" — picks the right verifier per platform.
  const handleVerifyAndSync = async () => {
    try {
      if (spec.fields.length > 0) {
        await SocialAutomationService.persistManualConfig({ platform, displayName, config: values });
      }
    } catch { /* surfaced by verifier */ }

    let ok = false;
    if (isGoogle) {
      ok = (values.oauth_client_id && values.oauth_client_secret)
        ? await handleVerifyCredentials()
        : await handleVerifyIdentity();
    } else if (isLinkedIn) {
      ok = await handleVerifyLinkedIn();
    } else if (spec.fields.length > 0) {
      ok = await handleTestConnection();
    } else {
      await handleSave();
      ok = true;
    }
    if (ok) onOpenChange(false);
  };

  const [oneClickBusy, setOneClickBusy] = useState(false);
  const handleOneClickOAuth = async () => {
    setOneClickBusy(true);
    try {
      if (!sharedOauthPlatform) {
        toast.error('התחברות מהירה אינה זמינה');
        return;
      }

      const { data: shared, error: sharedErr } = await supabase
        .from('platform_oauth_apps')
        .select('client_id')
        .eq('platform', sharedOauthPlatform)
        .maybeSingle();
      if (sharedErr) throw sharedErr;
      const clientId = shared?.client_id?.trim();
      if (!clientId) {
        toast.error('התחברות מהירה אינה זמינה', {
          description:
            sharedOauthPlatform === 'google'
              ? 'הסופר-אדמין צריך להגדיר GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET או לשמור אותם בכרטיס האישורים המשותפים.'
              : sharedOauthPlatform === 'meta'
                ? 'הסופר-אדמין צריך לשמור App ID/App Secret של Meta בכרטיס האישורים המשותפים.'
                : 'הסופר-אדמין צריך לשמור Client ID/Secret של LinkedIn בכרטיס האישורים המשותפים.',
        });
        return;
      }

      const host = window.location.hostname;
      const redirectUri =
        host === 'ai.realtyz.co.il' || host === 'realtyzai.lovable.app'
          ? 'https://ai.realtyz.co.il/oauth/callback'
          : `${window.location.origin}/oauth/callback`;

      const scopes = Array.from(new Set(oauthScopes)).join(' ');
      const stateTag = supportsOneClick ? `${platform}:oneclick:${crypto.randomUUID()}` : `${platform}:${crypto.randomUUID()}`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state: stateTag,
      });
      if (sharedOauthPlatform === 'google') {
        params.set('access_type', 'offline');
        params.set('prompt', 'select_account consent');
        params.set('include_granted_scopes', 'true');
      } else if (sharedOauthPlatform === 'linkedin') {
        params.set('prompt', 'consent');
      } else if (sharedOauthPlatform === 'meta') {
        params.set('display', 'popup');
      }

      const url = `${OAUTH_AUTHORIZE_URLS[platform] ?? 'https://accounts.google.com/o/oauth2/v2/auth'}?${params.toString()}`;

      const w = 520, h = 640;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        url,
        'realtyz-oauth',
        `width=${w},height=${h},left=${left},top=${top}`,
      );
      if (!popup) {
        toast.error('הדפדפן חסם את חלון ההתחברות', {
          description: 'אפשר חלונות קופצים עבור האתר ונסה שוב.',
        });
        setOneClickBusy(false);
        return;
      }

      onOpenChange(false);

      const watcher = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(watcher);
          setOneClickBusy(false);
        }
      }, 600);
    } catch (e: any) {
      toast.error('התחברות מהירה נכשלה', { description: e?.message });
      setOneClickBusy(false);
    }
  };

  const consoleLink = PROVIDER_CONSOLE[platform];
  const showAdvanced = spec.fields.length > 0;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden" dir="rtl">
        {/* Thin status line */}
        <div
          className={`h-[2px] w-full transition-colors ${
            statusTone === 'ok'
              ? 'bg-emerald-500'
              : statusTone === 'pending'
                ? 'bg-amber-500'
                : statusTone === 'failed'
                  ? 'bg-destructive'
                  : 'bg-transparent'
          }`}
          aria-hidden
        />

        <div className="px-5 pt-4 pb-2">
          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-2.5">
              <BrandLogo platform={platform} size={20} />
              <DialogTitle className="text-[15px] font-semibold flex items-center gap-1.5">
                {displayName}
                {statusTone === 'ok' && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="מאומת" />
                )}
              </DialogTitle>
              <DialogDescription className="sr-only">
                הזנת פרטי חיבור עבור {displayName}
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="px-5 pb-3 space-y-3">
          {supportsOneClick && (
            <Button
              type="button"
              onClick={handleOneClickOAuth}
              disabled={oneClickBusy || verifying_any}
              className="w-full h-11 text-[13px] font-semibold bg-white text-[#1f1f1f] border border-border/60 hover:bg-white/95 shadow-sm flex items-center justify-center gap-2"
            >
              {oneClickBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {sharedOauthPlatform === 'google' ? <GoogleGIcon className="h-4 w-4" /> : <BrandLogo platform={platform} size={16} />}
                  <span>התחברות מהירה בלחיצה אחת</span>
                </>
              )}
            </Button>
          )}

          {/* Manual fields — collapsed under Advanced for any platform that has One-Click. */}
          {showAdvanced && supportsOneClick ? (
            <div className="border border-border/40 rounded-md">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>הגדרות מתקדמות (Client ID / Secret)</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </button>
              {advancedOpen && (
                <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border/40">
                  {spec.fields.map((f) => {
                    const isFilled = (values[f.key] ?? '').trim().length > 0;
                    const isSecret = f.type === 'password';
                    return (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">{f.label}</Label>
                        <Input
                          type={isSecret ? 'password' : 'text'}
                          placeholder={f.placeholder ?? ''}
                          value={values[f.key] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          dir="ltr"
                          className={`h-9 text-[13px] border-0 bg-muted/50 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/50 ${
                            isFilled && isSecret ? 'tracking-widest' : ''
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : showAdvanced ? (
            <div className="space-y-2.5">
              {spec.fields.map((f) => {
                const isFilled = (values[f.key] ?? '').trim().length > 0;
                const isSecret = f.type === 'password';
                return (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">{f.label}</Label>
                    <Input
                      type={isSecret ? 'password' : 'text'}
                      placeholder={f.placeholder ?? ''}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      dir="ltr"
                      className={`h-9 text-[13px] border-0 bg-muted/50 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/50 ${
                        isFilled && isSecret ? 'tracking-widest' : ''
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            !supportsOneClick && (
              <p className="text-xs text-muted-foreground text-center py-2">
                אין הגדרות ידניות זמינות לפלטפורמה זו.
              </p>
            )
          )}

          {/* Connection Resources — collapsed dropdown at bottom of body */}
          {(consoleLink || oauthUrls.redirects.length > 0) && (
            <div className="border-t border-border/40 pt-2">
              <button
                type="button"
                onClick={() => setResourcesOpen((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>עזרים לחיבור</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${resourcesOpen ? 'rotate-180' : ''}`} />
              </button>
              {resourcesOpen && (
                <div className="mt-2 space-y-2">
                  {consoleLink && (
                    <a
                      href={consoleLink.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {consoleLink.label}
                    </a>
                  )}
                  {(isGoogle || isLinkedIn || isMeta || platform === 'tiktok' || platform === 'x') && (
                    <>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Authorized JavaScript Origins</p>
                        <div className="space-y-1">
                          {oauthUrls.origins.map((o) => (
                            <div key={o} className="flex items-center gap-1.5 group">
                              <code className="flex-1 text-[10px] bg-muted/50 px-1.5 py-1 rounded truncate" dir="ltr">{o}</code>
                              <button
                                type="button"
                                onClick={() => copy(o, `o-${o}`)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                aria-label="העתק"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">Authorized Redirect URIs</p>
                        <div className="space-y-1">
                          {oauthUrls.redirects.map((r) => (
                            <div key={r} className="flex items-center gap-1.5 group">
                              <code className="flex-1 text-[10px] bg-muted/50 px-1.5 py-1 rounded truncate" dir="ltr">{r}</code>
                              <button
                                type="button"
                                onClick={() => copy(r, `r-${r}`)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                aria-label="העתק"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile-friendly footer: buttons always side-by-side */}
        <DialogFooter className="border-t border-border/40 px-5 py-2.5 flex-row gap-2 sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={verifying_any || oneClickBusy}
            className="h-8 text-[12px] text-muted-foreground hover:text-foreground flex-1 sm:flex-none"
          >
            ביטול
          </Button>
          <Button
            size="sm"
            onClick={handleVerifyAndSync}
            disabled={verifying_any || oneClickBusy || spec.fields.length === 0}
            className="h-8 text-[12px] flex-1 sm:flex-none sm:min-w-[120px]"
          >
            {verifying_any
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : 'אמת וסנכרן'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
