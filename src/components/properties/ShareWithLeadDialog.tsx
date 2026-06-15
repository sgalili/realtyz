import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ListingOutreachDialog } from '@/components/dealroom/ListingOutreachDialog';
import type { HomelyProperty } from '@/lib/homelyMockProperties';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  city: string | null;
  lead_stage: string | null;
};

const ACTIVE_STAGES = ['new', 'new_lead', 'lead', 'contacted', 'outreach', 'listing_outreach', 'negotiation', 'qualified', 'meeting'];

interface Props {
  property: HomelyProperty | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ShareWithLeadDialog({ property, open, onOpenChange }: Props) {
  const [search, setSearch] = useState('');
  const [outreachLeadId, setOutreachLeadId] = useState<string | null>(null);
  const [outreachOpen, setOutreachOpen] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ['active-leads-share'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city, lead_stage')
        .eq('is_demo', false)
        .in('lead_stage', ACTIVE_STAGES)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads ?? [];
    return (leads ?? []).filter((p) =>
      (p.full_name || '').toLowerCase().includes(q) ||
      p.phone_number.includes(q) ||
      (p.city || '').toLowerCase().includes(q),
    );
  }, [leads, search]);

  function handlePick(lead: Lead) {
    if (!property) return;
    setOutreachLeadId(lead.id);
    setOutreachOpen(true);
    onOpenChange(false);
    toast.success(`טיוטת פנייה נפתחת עבור ${lead.full_name || lead.phone_number}`);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right">
            <DialogTitle>שתף נכס עם מתעניין</DialogTitle>
            <DialogDescription>
              בחרו מתעניין פעיל מהעסקאות כדי לפתוח טיוטת פנייה (Listing Outreach).
            </DialogDescription>
          </DialogHeader>

          {property && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold line-clamp-1">{property.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {property.city} · {property.rooms} חד' · ₪{property.price.toLocaleString('he-IL')}
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, טלפון או עיר"
              className="pe-9"
            />
          </div>

          <ScrollArea className="max-h-80 -mx-2">
            <div className="px-2 space-y-1.5">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  לא נמצאו מתעניינים פעילים.
                </p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePick(p)}
                    className="w-full text-right rounded-lg border p-3 hover:bg-accent hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {p.full_name || p.phone_number}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.city || '—'} · {p.phone_number}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{p.lead_stage}</Badge>
                      <Send className="h-4 w-4 text-primary" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ListingOutreachDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        defaultLeadId={outreachLeadId}
        defaultListingId={property?.id ?? null}
        defaultSource={(property?.source as 'internal' | 'homely') === 'homely' ? 'homely' : 'internal'}
      />
    </>
  );
}
