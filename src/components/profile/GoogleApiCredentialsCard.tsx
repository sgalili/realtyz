import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, ExternalLink, KeyRound, Loader2 } from 'lucide-react';

const REDIRECT_URI = 'https://realtyz.co.il/oauth/callback';

/**
 * Super-admin card for the shared Google OAuth app credentials
 * (Client ID + Client Secret). Once saved, the one-click connect
 * buttons for Gmail / Google Calendar resolve this client_id via the
 * `google-oauth-config` edge function.
 */
export function GoogleApiCredentialsCard() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['platform_oauth_apps', 'google'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_oauth_apps')
        .select('client_id, client_secret, updated_at')
        .eq('platform', 'google')
        .maybeSingle();
      if (error) throw error;
      return data as { client_id: string | null; client_secret: string | null } | null;
    },
  });

  useEffect(() => {
    setClientId(data?.client_id ?? '');
    setClientSecret(data?.client_secret ?? '');
  }, [data?.client_id, data?.client_secret]);

  const configured = !!(data?.client_id?.trim() && data?.client_secret?.trim());

  const save = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('נדרשים Client ID ו-Client Secret');
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from('platform_oauth_apps').upsert(
        {
          platform: 'google',
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          updated_by: userRes.user?.id ?? null,
        },
        { onConflict: 'platform' },
      );
      if (error) throw error;
      toast.success('ההגדרות נשמרו', { description: 'החיבור המהיר ל-Gmail וליומן זמין כעת' });
      refetch();
    } catch (e: any) {
      toast.error('השמירה נכשלה', { description: e?.message ?? 'שגיאה לא ידועה' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-3 rounded-xl border bg-muted/30 p-3 text-right">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          <span>אישורי Google API</span>
          {configured && (
            <Badge className="gap-1 border-transparent bg-emerald-600 text-[11px] font-semibold text-white">
              <CheckCircle2 className="h-3 w-3" /> מוגדר
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}
        >
          <ExternalLink className="h-3 w-3" /> Google Cloud Console
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Redirect URI:</span>
        <code dir="ltr" className="flex-1 truncate rounded border bg-background/60 px-2 py-1 text-[11px]">
          {REDIRECT_URI}
        </code>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          aria-label="העתק כתובת חזרה"
          onClick={() => {
            navigator.clipboard.writeText(REDIRECT_URI);
            toast.success('הועתק');
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="google-client-id" className="text-[12px]">Google Client ID</Label>
          <Input
            id="google-client-id"
            dir="ltr"
            autoComplete="off"
            placeholder="1234567890-abc.apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="google-client-secret" className="text-[12px]">Google Client Secret</Label>
          <Input
            id="google-client-secret"
            dir="ltr"
            type="password"
            autoComplete="new-password"
            placeholder="GOCSPX-..."
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Button size="sm" className="h-8 gap-1 text-xs" onClick={save} disabled={saving || isLoading}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        שמור הגדרות
      </Button>
    </div>
  );
}

export default GoogleApiCredentialsCard;
