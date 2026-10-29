import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import { useListingAudience } from '@/hooks/useListingAudience';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { Button } from '@/components/ui/button';
import { SelectBox, SelectModeToggle } from '@/components/ui/multi-select-controls';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import StandardPropertyCard from './StandardPropertyCard';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { UnifiedResult } from '@/lib/propertySearch';
import type { PublicCard } from '@/pages/PublicListingsBoard';
function result(card: PublicCard): UnifiedResult {
  return { key: `board:${card.id}`, source: 'mine', sources: ['mine'], localId: card.id, title: publicAdTitle(card), price: card.price, city: card.city, address: card.street, neighborhood: card.neighborhood, rooms: card.rooms, size_sqm: card.sqm, photos: card.photos, url: null, listing_type: card.deal_type === 'rent' ? 'rent' : 'sale', property_type: null };
}
export default function PartnerActivityProperties() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const feed = useQuery({ queryKey: ['partner-activity-board', user?.id, owner], queryFn: fetchPublicBoardFeed, retry: false, staleTime: 60_000 });
  const audience = useListingAudience((feed.data ?? []).map(card => card.id));
  const cards = (feed.data ?? []).filter(card => card.affiliate_enabled === true && audience.isVisible(card.id));
  const favorites = useListingFavorites();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  if (feed.isLoading || audience.isLoading) return <p role="status" className="py-8 text-center text-muted-foreground">טוען נכסים…</p>;
  if (feed.isError) return <div role="alert" className="py-8 text-center">לא ניתן לטעון נכסים כרגע <Button variant="link" onClick={() => void feed.refetch()}>ניסיון נוסף</Button></div>;
  const chosen = cards.filter(card => selected.has(card.id)).map(result);
  return <div className="space-y-3 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SelectModeToggle active={selectMode} onToggle={() => { setSelectMode(!selectMode); setSelected(new Set()); }} count={chosen.length} total={cards.length} onSelectAll={() => setSelected(selected.size === cards.length ? new Set() : new Set(cards.map(card => card.id)))} />
      <PropertyShareMenu results={chosen} label="שיווק מיידי" hideOpenPage disabled={!chosen.length} />
    </div>
    {!cards.length && <p className="py-8 text-center text-muted-foreground">אין כרגע נכסים פתוחים לשיתוף</p>}
    {cards.map(card => <div key={card.id} className="flex items-start gap-2">
      {selectMode && <SelectBox checked={selected.has(card.id)} label={`בחירת ${publicAdTitle(card)}`} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next; })} />}
      <div className="min-w-0 flex-1"><StandardPropertyCard card={card} signedIn showOwnerMenu={false} isFav={favorites.favoriteIds.has(card.id)} onFavorite={() => void favorites.toggleFavorite(card.id)} /></div>
    </div>)}
  </div>;
}