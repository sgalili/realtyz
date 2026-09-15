import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CalendarCheck2, Loader2 } from 'lucide-react';
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');

type PublicTour = {
  client_name: string | null;
  property_title: string | null;
  property_address: string | null;
  scheduled_label: string;
  status: string;
  client_confirmed_at: string | null;
};

/** Public page a client opens from WhatsApp to approve the proposed tour time. */
export default function TourConfirm() {
  const { token } = useParams<{ token: string }>();
  const [tour, setTour] = useState<PublicTour | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (init?: RequestInit) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/tour-confirm?token=${encodeURIComponent(token ?? '')}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, ...(init?.headers ?? {}) },
    });
    return (await res.json()) as { ok?: boolean; tour?: PublicTour; error?: string };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await call();
        if (cancelled) return;
        if (!data.ok || !data.tour) setError('הקישור אינו תקין או שהסיור בוטל.');
        else setTour(data.tour);
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את פרטי הסיור.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const decide = async (decline: boolean) => {
    setSaving(true);
    try {
      const data = await call({ method: 'POST', body: JSON.stringify({ token, decline }) });
      if (data.ok && data.tour) setTour(data.tour);
      else setError(data.error ?? 'העדכון נכשל, אפשר לנסות שוב.');
    } catch {
      setError('העדכון נכשל, אפשר לנסות שוב.');
    } finally {
      setSaving(false);
    }
  };

  const confirmed = tour?.status === 'confirmed' && !!tour?.client_confirmed_at;

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        {loading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : tour ? (
          <>
            <CalendarCheck2 className="mx-auto h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold">אישור מועד סיור</h1>
            <p className="text-[15px] text-foreground/90">
              {tour.property_title || tour.property_address || 'הנכס'}
            </p>
            {tour.property_address && tour.property_title ? (
              <p className="text-sm text-muted-foreground">{tour.property_address}</p>
            ) : null}
            <p className="text-base font-semibold">{tour.scheduled_label}</p>
            {confirmed ? (
              <p className="text-sm font-semibold text-success">
                תודה, המועד אושר. המתווך קיבל עדכון והסיור נשמר ביומן.
              </p>
            ) : (
              <div className="space-y-2">
                <Button className="w-full font-bold" onClick={() => decide(false)} disabled={saving}>
                  {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  המועד מתאים לי
                </Button>
                <Button variant="outline" className="w-full" onClick={() => decide(true)} disabled={saving}>
                  המועד לא מתאים, נתאם אחר
                </Button>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
