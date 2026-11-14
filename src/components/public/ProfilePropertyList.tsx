import { Heart } from 'lucide-react';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import { Button } from '@/components/ui/button';
import { HorizontalTableScroll, FixedTablePanel } from '@/components/ui/horizontal-table-scroll';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { QuickShareButton, ProfileAssetMenu } from '@/components/community/ProfileAssetActions';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import { formatRentalPrice } from '@/lib/propertyPrice';
import { cn } from '@/lib/utils';
import PublicCardSummary from './PublicCardSummary';
import PropertyCommissionIcons from './PropertyCommissionIcons';
import ExpandedPropertyDetails from './ExpandedPropertyDetails';
import PropertyContactActions from './PropertyContactActions';

/** Compact board summary cells; all media and publisher details live below expansion. */
export function ProfilePropertyList({ cards, expandedId, onExpand, favoriteIds, onFavorite, isOwner }: {
  cards: PublicCard[]; expandedId: string | null; onExpand: (id: string | null) => void;
  favoriteIds: Set<string>; onFavorite: (id: string) => void; isOwner: boolean;
}) {
  return <HorizontalTableScroll aria-label="טבלת נכסים" className="max-h-[75dvh] rounded-lg border bg-card">
    <table className="w-max min-w-full text-sm">
      <thead className="sticky top-0 z-10 bg-card text-muted-foreground"><tr>
        <th className="p-2 text-start">נכס</th><th className="p-2 text-start">מחיר</th><th className="p-2">תגמולים</th><th className="p-2">חדרים</th><th className="p-2">מ״ר</th><th className="p-2">קומה</th><th className="p-2"><span className="sr-only">פעולות</span></th>
      </tr></thead>
      <tbody>{cards.map(card => {
        const open = expandedId === card.id;
        const title = publicAdTitle(card);
        const fav = favoriteIds.has(card.id);
        const toggle = () => onExpand(open ? null : card.id);
        return [
          <tr key={card.id} data-row-id={card.id} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle(); } }} className="cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <td className="p-2 text-foreground"><div className="w-[min(18rem,max(6.5rem,calc(100vw-14rem)))] min-w-0 max-w-[18rem] break-words [overflow-wrap:anywhere] sm:w-96 sm:max-w-[24rem]"><PublicCardSummary card={card} dense showBroker={false} showCommissions={false} /></div></td>
            <td className={cn('whitespace-nowrap p-2 text-[17px] font-bold', card.deal_type === 'rent' ? 'text-sale' : 'text-success')}>{formatRentalPrice(card.price, card.deal_type)}</td>
            <td className="p-2"><PropertyCommissionIcons table listingId={card.id} raw={{ reward_types: card.reward_types, closing_level: card.closing_level, reward_levels: card.reward_levels }} /></td>
            <td className="p-2 text-center text-base">{card.rooms || ''}</td><td className="p-2 text-center text-base">{card.sqm || ''}</td><td className="whitespace-nowrap p-2 text-center text-base">{card.floor != null ? `${card.floor}${card.total_floors ? `/${card.total_floors}` : ''}` : ''}</td>
            <td className="p-2" onClick={event => event.stopPropagation()}><div className="flex items-center gap-1">
              <QuickShareButton title={title} path={`/p/${encodeURIComponent(card.slug || card.id)}`} />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={fav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" aria-pressed={fav} onClick={() => onFavorite(card.id)}><Heart className={cn('h-4 w-4', fav && 'fill-current')} /></Button>
              <ProfileAssetMenu card={card} title={title} isOwner={isOwner} isFav={fav} onFavorite={() => onFavorite(card.id)} />
            </div></td>
          </tr>,
          <tr key={`${card.id}-details`} className="bg-muted/10"><td colSpan={7} className="p-0"><FixedTablePanel>
            <AnimatedExpansion open={open}><div data-profile-property-details={card.id} className="min-w-0 p-3 lg:p-5"><ExpandedPropertyDetails idOrSlug={card.id} isFav={fav} onFavorite={() => onFavorite(card.id)} onClose={() => onExpand(null)} /></div></AnimatedExpansion>
            {open && <PropertyContactActions listingId={card.id} title={title} dealType={card.deal_type} options={card.contact_options} compact showShare={false} className="sticky bottom-0 z-20 mx-3 bg-card pb-2 pt-1 lg:mx-5" />}
          </FixedTablePanel></td></tr>,
        ];
      })}</tbody>
    </table>
  </HorizontalTableScroll>;
}