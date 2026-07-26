/**
 * SharedProperty
 * ---------------
 * Public, auth-free property page for share links minted by the
 * `create-property-share` edge function. Renders workspace label + a single
 * property card + a direct WhatsApp "contact broker" button.
 * Route: /share/property/:token
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle, MapPin, Home, Ruler, Bed } from 'lucide-react';

type SharedPayload = {
  workspace_name: string | null;
  logo_url?: string | null;
  owner_wa?: string | null;
  owner_name?: string | null;
  broker_wa: string | null;
  property: any | null;
};

function normalizeWA(raw?: string | null) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

export default function SharedProperty() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-property-view?token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json())?.error || 'שגיאה בטעינת הנכס');
        setData(await res.json());
      } catch (e: any) {
        setError(e?.message ?? 'שגיאה בטעינה');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {error || 'הקישור לא זמין או פג תוקף.'}
          </p>
        </div>
      </div>
    );
  }

  const p = data.property;
  const photos: string[] =
    (Array.isArray(p.media_photos) ? p.media_photos : [])
      .concat(Array.isArray(p.photos) ? p.photos : [])
      .filter((s: any) => typeof s === 'string' && s);
  const price = Number(p.asking_price ?? p.price ?? 0) || 0;
  const isRent = String(p.deal_type ?? p.transaction_type ?? '').toLowerCase() === 'rent'
    || (price > 0 && price < 50_000);
  const priceStr = price
    ? `₪${price.toLocaleString('he-IL')}${isRent ? '/חודש' : ''}`
    : 'לפרטים';

  const wa = normalizeWA(data.owner_wa) ?? normalizeWA(data.broker_wa);
  const waMsg = encodeURIComponent(
    `שלום, ראיתי את הנכס "${p.property_title ?? p.title ?? ''}" ואשמח לקבל פרטים נוספים.`,
  );
  const waHref = wa ? `https://wa.me/${wa}?text=${waMsg}` : null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="relative max-w-3xl mx-auto px-4 py-3 flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            {data.logo_url ? (
              <img
                src={data.logo_url}
                alt={data.workspace_name || 'לוגו'}
                className="h-10 w-auto object-contain"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : null}
            <h1 className="text-sm font-bold text-slate-800 text-center">
              {data.workspace_name || 'Realtyz'}
            </h1>
          </div>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              aria-label="שיחת WhatsApp"
              className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <img
              src={photos[0]}
              alt=""
              className="col-span-2 w-full h-72 object-cover rounded-xl"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
            {photos.slice(1, 5).map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="w-full h-32 object-cover rounded-lg"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ))}
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-900">
            {p.property_title ?? p.title ?? 'נכס'}
          </h2>
          <p className="text-3xl font-bold text-primary tabular-nums">{priceStr}</p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {(p.city || p.address || p.neighborhood) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {[p.city, p.neighborhood, p.address].filter(Boolean).join(' · ')}
              </span>
            )}
            {p.rooms ? (
              <span className="inline-flex items-center gap-1">
                <Bed className="h-4 w-4" /> {p.rooms} חדרים
              </span>
            ) : null}
            {(p.sqm || p.size_sqm) ? (
              <span className="inline-flex items-center gap-1">
                <Ruler className="h-4 w-4" /> {p.sqm ?? p.size_sqm} מ״ר
              </span>
            ) : null}
            {p.floor != null ? (
              <span className="inline-flex items-center gap-1">
                <Home className="h-4 w-4" /> קומה {p.floor}
              </span>
            ) : null}
          </div>

          {p.description && (
            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {p.description}
            </p>
          )}
        </section>

        {waHref && (
          <div className="sticky bottom-4 pt-4">
            <a href={waHref} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-base shadow-lg">
                <MessageCircle className="h-5 w-5" />
                שלחו לי פרטים ב-WhatsApp
              </Button>
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
