import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ROLE_BADGE } from './CommunityDirectory';
import { formatRentalPrice } from '@/lib/propertyPrice';

type Card = { id: string; full_name: string | null; category: string; office_name: string | null; license_number: string | null };

export function CommunityProfileDialog({ userId, fallbackName, onOpenChange }: { userId: string | null; fallbackName?: string | null; onOpenChange: (open: boolean) => void }) {
  const card = useQuery({
    queryKey: ['community-profile-card', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_cards', { _ids: [userId!] });
      if (error) throw error;
      return ((data ?? []) as Card[])[0] ?? null;
    },
  });
  const listings = useQuery({
    queryKey: ['community-profile-listings', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_listings', { _user: userId! });
      if (error) throw error;
      return data ?? [];
    },
  });
  const c = card.data;
  return <Dialog open={!!userId} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{c?.full_name ?? fallbackName ?? 'פרופיל'}{c && <Badge variant="secondary">{ROLE_BADGE[c.category] ?? 'משתמש'}</Badge>}</DialogTitle></DialogHeader>
      {card.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <div className="space-y-1 text-muted-foreground">
        {c?.office_name && <p className="flex items-center gap-2"><Building2 className="h-4 w-4" />{c.office_name}</p>}
        {c?.license_number && <p>רישיון תיווך {c.license_number}</p>}
      </div>}
      <h3 className="mt-2 font-semibold">נכסים פעילים לשיתוף פעולה</h3>
      {listings.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
      {listings.isError && <p role="alert" className="text-destructive">טעינת הנכסים נכשלה</p>}
      {listings.data && !listings.data.length && <p className="text-sm text-muted-foreground">אין כרגע נכסים פעילים</p>}
      <ul className="space-y-2">{listings.data?.map(l => <li key={l.id}>
        <a href={`/p/${l.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-border p-2 hover:bg-muted">
          {l.image_url ? <img src={l.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-md bg-muted" />}
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.property_title || l.address || 'נכס'}</span>
            <span className="block truncate text-sm text-muted-foreground">{[l.city, l.deal_type === 'rent' ? 'השכרה' : l.deal_type === 'sale' ? 'מכירה' : null].filter(Boolean).join(' · ')}</span></span>
          {l.asking_price ? <span className="shrink-0 text-sm font-semibold">{formatRentalPrice(Number(l.asking_price), l.deal_type)}</span> : null}
        </a></li>)}</ul>
    </DialogContent>
  </Dialog>;
}
