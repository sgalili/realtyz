import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';
import {
  buildGoogleAllAuthUrl,
  clearFlag,
  connectedGoogleServices,
  isFacebookConnected,
  FIRST_TIME_SYNC_KEY,
  GOOGLE_SERVICES_PENDING_KEY,
  readFlag,
} from '@/lib/googleAllOAuth';

/** New accounts created within this window count as "first time". */
const FIRST_SESSION_WINDOW_MS = 30 * 60 * 1000;

/**
 * Single approval popup shown ONCE, on the user's very first session, asking to
 * link the Google services (Gmail / Calendar / YouTube) and Facebook together.
 * Nothing is auto-redirected anymore: the broker approves explicitly.
 */
export function FirstTimeSyncDialog() {
  const [open, setOpen] = useState(false);
  const [googleDone, setGoogleDone] = useState(false);
  const [facebookDone, setFacebookDone] = useState(false);
  const [busy, setBusy] = useState<'google' | 'facebook' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (readFlag(window.localStorage, FIRST_TIME_SYNC_KEY) === '1') return;

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return;

      // Absolute first time only: a fresh Google sign-in flag, or a profile that
      // was created moments ago. Returning users are never interrupted.
      const pending = readFlag(window.sessionStorage, GOOGLE_SERVICES_PENDING_KEY) === '1';
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .maybeSingle();
      const createdAt = (profile as any)?.created_at ? Date.parse((profile as any).created_at) : NaN;
      const brandNew = Number.isFinite(createdAt) && Date.now() - createdAt < FIRST_SESSION_WINDOW_MS;
      if (!pending && !brandNew) return;

      const [google, fbLive] = await Promise.all([connectedGoogleServices(), isFacebookConnected()]);
      const allGoogle = google.has('gmail') && google.has('google_calendar') && google.has('youtube');
      if (cancelled) return;
      setGoogleDone(allGoogle);
      setFacebookDone(fbLive);
      // Everything is already linked: never interrupt with a pointless popup.
      if (allGoogle && fbLive) {
        try { window.localStorage.setItem(FIRST_TIME_SYNC_KEY, '1'); } catch { /* storage disabled */ }
        clearFlag(window.sessionStorage, GOOGLE_SERVICES_PENDING_KEY);
        return;
      }
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const finish = () => {
    try { window.localStorage.setItem(FIRST_TIME_SYNC_KEY, '1'); } catch { /* storage disabled */ }
    clearFlag(window.sessionStorage, GOOGLE_SERVICES_PENDING_KEY);
    setOpen(false);
  };

  const connectGoogle = async () => {
    setBusy('google');
    const url = await buildGoogleAllAuthUrl();
    if (!url) {
      setBusy(null);
      toast.error('חיבור גוגל אינו מוגדר כרגע', { description: 'אפשר לחבר ידנית בעמוד הפרופיל.' });
      return;
    }
    try { window.localStorage.setItem(FIRST_TIME_SYNC_KEY, '1'); } catch { /* storage disabled */ }
    window.location.assign(url);
  };

  const connectFacebook = async () => {
    setBusy('facebook');
    try {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', {
        body: { action: 'start', redirect_uri: oauthRedirectUri(), return_origin: oauthReturnOrigin() },
      });
      if (error || !(data as any)?.auth_url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      const opened = openOAuthWindow(String((data as any).auth_url));
      if (!opened) toast.error('הדפדפן חסם את חלון ההתחברות', { description: 'אפשרו חלונות קופצים ונסו שוב.' });
    } catch (e: any) {
      toast.error('חיבור פייסבוק נכשל', { description: String(e?.message ?? 'נסו שוב מעמוד הפרופיל.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent dir="rtl" className="max-w-md text-right">
        <DialogHeader className="text-right">
          <DialogTitle>חיבור החשבונות שלך</DialogTitle>
          <DialogDescription>
            אישור חד־פעמי לחיבור גוגל (Gmail, יומן, YouTube) ופייסבוק, כדי שהמערכת תוכל לשלוח, לתזמן ולפרסם בשמך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!googleDone && (
          <Button
            className="w-full justify-between"
            variant="outline"
            disabled={busy !== null}
            onClick={connectGoogle}
          >
            <span>{googleDone ? 'גוגל מחובר' : 'חיבור חשבון גוגל'}</span>
            {busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </Button>
          )}
          {googleDone && (
            <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              גוגל מחובר <Check className="h-4 w-4 text-emerald-600" />
            </p>
          )}
          {facebookDone && (
            <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              פייסבוק מחובר <Check className="h-4 w-4 text-emerald-600" />
            </p>
          )}

          {!facebookDone && (
            <Button
              className="w-full justify-between"
              variant="outline"
              disabled={busy !== null}
              onClick={connectFacebook}
            >
              <span>חיבור חשבון פייסבוק</span>
              {busy === 'facebook' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </Button>
          )}
        </div>

        <Button variant="ghost" className="w-full" onClick={finish}>
          אחר כך
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default FirstTimeSyncDialog;
