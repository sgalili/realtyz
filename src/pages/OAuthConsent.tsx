import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const PENDING_CONSENT_KEY = "realtyz-pending-oauth-consent";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("חסר מזהה בקשה");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        try { window.localStorage.setItem(PENDING_CONSENT_KEY, next); } catch { /* */ }
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try { window.localStorage.removeItem(PENDING_CONSENT_KEY); } catch { /* */ }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) { window.location.href = immediate; return; }
      setDetails(data);
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) { setBusy(false); return setError(error.message); }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); return setError("לא התקבלה כתובת חזרה."); }
    window.location.href = target;
  }

  const name = details?.client?.name ?? "אפליקציה חיצונית";
  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 space-y-4 text-center">
        {error ? (
          <p className="text-destructive">לא ניתן לטעון את בקשת החיבור: {error}</p>
        ) : !details ? (
          <p className="text-muted-foreground">טוען…</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold">חיבור {name} לחשבון שלך</h1>
            <p className="text-muted-foreground">
              {name} יוכל לקרוא את הלידים והנכסים בסביבת העבודה שלך ב-Realtyz AI+, בשמך.
            </p>
            <div className="flex gap-3 justify-center">
              <Button disabled={busy} onClick={() => decide(true)}>אישור</Button>
              <Button variant="outline" disabled={busy} onClick={() => decide(false)}>דחייה</Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
