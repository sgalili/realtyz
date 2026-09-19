import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useOwnerInterest, useOwnerListings } from '@/hooks/useOwnerListings';

const INTENT_LABELS: Record<string, string> = {
  favorite: 'מועדפים',
  details: 'פרטים מלאים',
  navigation: 'ניווט',
  contact: 'יצירת קשר',
};

/** Private owner screen: every visitor who asked about their properties. */
export default function OwnerLeads() {
  const { data: interest = [], isLoading } = useOwnerInterest();
  const { data: listings = [] } = useOwnerListings();

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) map.set(l.id, l.property_title || [l.city, l.neighborhood].filter(Boolean).join(' · ') || 'נכס');
    return map;
  }, [listings]);

  return (
    <div dir="rtl" className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Users className="h-5 w-5 text-blue-600" /> לידים מתעניינים
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">כל מי שהשאיר פרטים על הנכסים שלכם בלוח הציבורי.</p>
      </header>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">טוען…</p>
      ) : interest.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">אין מתעניינים עדיין</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-right text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">שם</th>
                <th className="px-3 py-2 font-semibold">טלפון</th>
                <th className="px-3 py-2 font-semibold">נכס</th>
                <th className="px-3 py-2 font-semibold">בקשה</th>
                <th className="px-3 py-2 font-semibold">שעת חזרה</th>
                <th className="px-3 py-2 font-semibold">שוחח עם ריטה</th>
                <th className="px-3 py-2 font-semibold">תאריך</th>
              </tr>
            </thead>
            <tbody>
              {interest.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-semibold text-foreground">{row.visitor_name}</td>
                  <td className="px-3 py-2">
                    <a href={`tel:${row.visitor_phone}`} className="text-primary">{row.visitor_phone}</a>
                  </td>
                  <td className="px-3 py-2">{titleById.get(row.listing_id) ?? '—'}</td>
                  <td className="px-3 py-2">{INTENT_LABELS[row.intent ?? ''] ?? '—'}</td>
                  <td className="px-3 py-2">{row.callback_window ?? '—'}</td>
                  <td className="px-3 py-2">{row.rita_engaged_at ? 'כן' : 'לא'}</td>
                  <td className="px-3 py-2">{new Date(row.created_at).toLocaleDateString('he-IL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
