/**
 * PropertyFeatureBadges
 * ---------------------
 * Renders the complete list of property features / amenities as an icon badge
 * grid. Values are collected from the dedicated boolean columns (elevator,
 * parking) plus every jsonb bag we store on a listing (features, attributes,
 * additional_details, source_metadata) so nothing in the DB is skipped.
 * Shared by the internal property page and the public share page.
 */
import { Card } from '@/components/ui/card';
import { Home } from 'lucide-react';
import { LABELS, ICONS, normalizeKey } from '@/components/properties/PropertyRichDetailsCard';

type Bag = Record<string, unknown> | null | undefined;

export type PropertyFeatureBadgesProps = {
  /** Any number of jsonb bags coming from the listing row. */
  sources?: Bag[];
  /** Dedicated boolean columns, keyed by their DB name. */
  flags?: Record<string, unknown> | null;
  title?: string;
  className?: string;
};

const BOOLEAN_TRUE = new Set(['true', 'יש', 'כן', '1']);
const BOOLEAN_FALSE = new Set(['false', 'אין', 'לא', '0']);

function classify(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (BOOLEAN_TRUE.has(s)) return true;
  if (BOOLEAN_FALSE.has(s)) return false;
  // "2 חניות" / numeric strings count as present.
  const n = Number(s);
  if (Number.isFinite(n)) return n > 0;
  return null;
}

/** Only amenity-style keys belong in the badge grid. */
const AMENITY_LABELS = new Set([
  'מעלית', 'מרפסת', 'מרפסות', 'ממ״ד', 'חניה', 'מחסן', 'גינה', 'מיזוג',
  'מזגן טורנדו', 'סורגים', 'דוד שמש', 'ריהוט', 'מרוהט', 'דלתות רב בריח',
  'גישה לנכים', 'משופץ', 'חדש', 'חיות מחמד', 'מתאים לשותפים', 'בריכה',
  'חדר כושר', 'סדרן כניסה', 'כניסה גמישה', 'כניסה מיידית', 'לטווח ארוך',
  'סאבלט', 'מטבח',
]);

export function PropertyFeatureBadges({
  sources = [],
  flags = null,
  title = 'מה יש בנכס?',
  className,
}: PropertyFeatureBadgesProps) {
  const collected = new Map<string, boolean>();

  const consume = (key: string, value: unknown) => {
    const name = LABELS[normalizeKey(key)];
    if (!name || !AMENITY_LABELS.has(name)) return;
    const state = classify(value);
    if (state === null) return;
    // A positive signal from any source wins.
    if (collected.get(name) === true) return;
    collected.set(name, state);
  };

  for (const bag of sources) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
    for (const [k, v] of Object.entries(bag)) consume(k, v);
  }
  if (flags) for (const [k, v] of Object.entries(flags)) consume(k, v);

  const items = [...collected.entries()]
    .map(([name, on]) => ({ name, on }))
    .sort((a, b) => Number(b.on) - Number(a.on) || a.name.localeCompare(b.name, 'he'));

  if (!items.length) return null;

  return (
    <Card className={`p-4 sm:p-5 ${className ?? ''}`} dir="rtl">
      <h2 className="mb-3 text-2xl font-bold text-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(({ name, on }) => {
          const Icon = ICONS[name] ?? Home;
          return (
            <div
              key={name}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[16px] ${
                on
                  ? 'border-primary/30 bg-primary/5 font-semibold text-foreground'
                  : 'border-border/60 text-muted-foreground/60 line-through decoration-1'
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${on ? 'text-primary' : ''}`} />
              <span className="truncate">{name}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default PropertyFeatureBadges;
