import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useOwnerListings, useUpdateOwnerListing } from '@/hooks/useOwnerListings';

type Draft = { tier1: string; tier2: string; tier3: string; enabled: boolean };

/**
 * Private owner screen: the reward paid to a partner at each stage —
 * 1) מתעניין חדש  2) סיור שבוצע  3) עסקה שנסגרה.
 */
export default function OwnerRewards() {
  const { data: listings = [], isLoading } = useOwnerListings();
  const update = useUpdateOwnerListing();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const l of listings) {
        if (next[l.id]) continue;
        next[l.id] = {
          tier1: l.affiliate_tier1_amount != null ? String(l.affiliate_tier1_amount) : '',
          tier2: l.affiliate_tier2_amount != null ? String(l.affiliate_tier2_amount) : '',
          tier3: l.affiliate_tier3_amount != null ? String(l.affiliate_tier3_amount) : '',
          enabled: !!l.affiliate_enabled,
        };
      }
      return next;
    });
  }, [listings]);

  const save = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    const num = (v: string) => (v.trim() ? Number(v) : null);
    try {
      await update.mutateAsync({
        id,
        patch: {
          affiliate_enabled: draft.enabled,
          affiliate_tier1_amount: num(draft.tier1),
          affiliate_tier2_amount: num(draft.tier2),
          affiliate_tier3_amount: num(draft.tier3),
        },
      });
      toast.success('התגמולים נשמרו');
    } catch {
      toast.error('השמירה נכשלה');
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Coins className="h-5 w-5 text-teal-600" /> הגדרת תגמולים ועמלות
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          קבעו את התגמול לשותף בכל שלב: מתעניין חדש, סיור שבוצע ועסקה שנסגרה.
        </p>
      </header>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">טוען…</p>
      ) : listings.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">אין נכסים רשומים על שמכם</p>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => {
            const draft = drafts[listing.id] ?? { tier1: '', tier2: '', tier3: '', enabled: false };
            const set = (patch: Partial<Draft>) =>
              setDrafts((d) => ({ ...d, [listing.id]: { ...draft, ...patch } }));
            return (
              <section key={listing.id} className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground">{listing.property_title || 'נכס'}</h2>
                    <p className="text-xs text-muted-foreground">
                      {[listing.city, listing.neighborhood].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    פתוח לשיווק ע״י שותפים
                    <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
                  </label>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    שלב 1 · מתעניין חדש
                    <Input className="mt-1" inputMode="numeric" value={draft.tier1} onChange={(e) => set({ tier1: e.target.value })} />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    שלב 2 · סיור שבוצע
                    <Input className="mt-1" inputMode="numeric" value={draft.tier2} onChange={(e) => set({ tier2: e.target.value })} />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    שלב 3 · עסקה שנסגרה
                    <Input className="mt-1" inputMode="numeric" value={draft.tier3} onChange={(e) => set({ tier3: e.target.value })} />
                  </label>
                </div>
                <Button size="sm" className="mt-3" disabled={update.isPending} onClick={() => void save(listing.id)}>
                  שמירה
                </Button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
