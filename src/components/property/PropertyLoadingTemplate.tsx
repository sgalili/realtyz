import { BedDouble, Layers, MapPin, Ruler } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { BackgroundSyncPill } from '@/components/property/BackgroundSyncPill';
import type { UnifiedResult } from '@/lib/propertySearch';

const nis = (n: number) => `₪${n.toLocaleString('he-IL')}`;

/** One spec tile: shows the real value when known, a thin placeholder if not. */
function SpecTile({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {value ? (
        <p className="text-[17px] font-bold text-foreground">{value}</p>
      ) : (
        <Skeleton className="h-5 w-16" />
      )}
    </div>
  );
}

function DetailRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

/**
 * The property page "loading" template.
 *
 * It is a 1:1 structural mirror of the loaded page — every section (specs,
 * gallery, מאפייני הנכס, פרטי הנכס, על הנכס, איש קשר) is already on screen with
 * its real heading, so values simply drop into place as they arrive from the
 * source ad instead of the layout appearing section by section.
 */
export function PropertyLoadingTemplate({
  snapshot,
  features,
  photo,
}: {
  snapshot: UnifiedResult | null;
  features: string[];
  photo: string | null;
}) {
  const rooms = snapshot?.rooms != null ? String(snapshot.rooms) : null;
  const sqm = snapshot?.size_sqm != null ? String(snapshot.size_sqm) : null;
  const floor = snapshot?.floor != null ? String(snapshot.floor) : null;

  return (
    <div className="space-y-6 p-3 sm:p-6" dir="rtl">
      {/* Header — real title/price when the catalog card already had them */}
      <header className="space-y-2">
        {snapshot?.title
          ? <h1 className="text-3xl font-bold leading-snug text-foreground">{snapshot.title}</h1>
          : <Skeleton className="h-9 w-3/4 max-w-xl" />}
        {snapshot?.neighborhood || snapshot?.city
          ? <p className="text-lg text-muted-foreground">{[snapshot?.neighborhood, snapshot?.city].filter(Boolean).join(', ')}</p>
          : <Skeleton className="h-6 w-1/3 max-w-sm" />}
        {snapshot?.price
          ? <p className="text-[38px] font-extrabold leading-none text-success tabular-nums">{nis(Number(snapshot.price))}</p>
          : <Skeleton className="h-10 w-48" />}
      </header>

      {/* Specs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SpecTile icon={BedDouble} label="חדרים" value={rooms} />
        <SpecTile icon={Ruler} label="מ״ר בנוי" value={sqm} />
        <SpecTile icon={Layers} label="קומה" value={floor} />
        <SpecTile icon={MapPin} label="כתובת" value={snapshot?.address ?? null} />
      </div>

      {/* Gallery — the snapshot thumbnail is painted instantly (blur-up) */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-primary">תמונות הנכס</h2>
        {photo
          ? <ProgressiveImage src={photo} eager alt="" className="h-[320px] w-full rounded-xl" />
          : <Skeleton className="h-[320px] w-full rounded-xl" />}
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-20 shrink-0 rounded-md" />)}
        </div>
      </section>

      {/* Features */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-[19px] font-bold text-primary">מאפייני הנכס</h2>
        {features.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {features.map((f) => (
              <span key={f} className="rounded-full border bg-muted px-3 py-1 text-sm font-medium">{f}</span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {['חניה', 'מרפסת', 'מעלית', 'מיזוג', 'ממ״ד', 'משופצת', 'מרוהטת', 'סורגים'].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">
                {label}
                <Skeleton className="h-3 w-3 rounded-full" />
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Details */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-[19px] font-bold text-primary">פרטי הנכס</h2>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {['סוג נכס', 'קומות בבניין', 'ארנונה', 'ועד בית', 'תאריך כניסה', 'מספר תשלומים', 'מ״ר גינה/מרפסת', 'תאריך פרסום'].map((label) => (
            <DetailRow key={label} label={label} />
          ))}
        </div>
      </section>

      {/* Description */}
      <section className="space-y-2">
        <h2 className="text-[19px] font-bold text-primary">על הנכס</h2>
        {snapshot?.description ? (
          <p className="max-w-4xl whitespace-pre-line text-lg leading-8 text-foreground">{snapshot.description}</p>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full max-w-3xl" />
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-5 w-2/3 max-w-xl" />
          </div>
        )}
      </section>

      {/* Contact */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-xl font-bold uppercase tracking-wider text-muted-foreground">הסוכן המטפל</h2>
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </section>

      <BackgroundSyncPill label="טוען את הנכס…" />
    </div>
  );
}
