import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { HorizontalTableScroll } from '@/components/ui/horizontal-table-scroll';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import PropertyContactActions from '@/components/public/PropertyContactActions';
import PublicCardSummary from '@/components/public/PublicCardSummary';
import PropertyCommissionIcons from '@/components/public/PropertyCommissionIcons';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu } from '@/components/public/PublicBoardTableControls';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { UnifiedResult } from '@/lib/propertySearch';
import type { PublicCard } from '@/components/public/StandardPropertyCard';

type Row = { card: PublicCard; result: UnifiedResult };

const shekel = (n?: number | null) => (n ? `₪${Number(n).toLocaleString('he-IL')}` : '');

/** /properties table: same columns, headers, rows and expansion as the homepage board, plus management tools. */
export default function ManagedBoardTable({ results, toCard, selectionMode, selectedIds, onToggleSelected, favoriteIds, onFavorite, quickPromotion }: {
  results: UnifiedResult[];
  toCard: (r: UnifiedResult) => PublicCard;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  favoriteIds: Set<string>;
  onFavorite: (id: string) => void;
  quickPromotion: (r: UnifiedResult) => ReactNode;
}) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const rows = useMemo<Row[]>(() => results.map(result => ({ result, card: toCard(result) })), [results, toCard]);
  const columns = usePublicBoardColumns<Row>(`managed:${user?.id || 'anon'}:${activeWorkspaceId || 'none'}`, rows, {
    columns: [
      { id: 'photo', label: 'תמונה' }, { id: 'address', label: 'כותרת' }, { id: 'price', label: 'מחיר' }, { id: 'commissions', label: 'תגמולים' },
      { id: 'rooms', label: 'חדרים' }, { id: 'sqm', label: 'מ״ר' }, { id: 'floor', label: 'קומה' },
    ],
    value: ({ card }, id) => id === 'price' ? card.price ?? null : id === 'rooms' ? card.rooms ?? null : id === 'sqm' ? card.sqm ?? null : id === 'floor' ? card.floor ?? null : id === 'address' ? publicAdTitle(card) : null,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visible = columns.visible;

  return (
    <BoardColumnDragArea controls={columns}>
      <HorizontalTableScroll ref={wrapRef} aria-label="טבלת נכסים" className="board-head-sticky flex-1 rounded-lg border bg-card">
        <table data-column-managed="true" className="w-max min-w-full text-sm">
          <thead className="bg-muted/40 text-[14px] text-muted-foreground">
            <tr>
              {selectionMode && <th className="w-8 p-2" aria-label="בחירה" />}
              {visible.map(id => <BoardColumnHeader key={id} id={id} controls={columns} />)}
              <th className="w-10 p-0 pt-2 text-end"><div className="flex justify-end"><BoardColumnMenu controls={columns} /></div></th>
            </tr>
          </thead>
          <tbody>
            {columns.sorted.map(({ card, result }) => {
              const title = publicAdTitle(card);
              const open = expandedId === result.key;
              const localId = result.localId;
              const toggle = () => setExpandedId(open ? null : result.key);
              return [
                <tr key={result.key} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className="cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {selectionMode && <td className="p-2" onClick={e => e.stopPropagation()}>{localId ? <Checkbox checked={selectedIds.has(localId)} onCheckedChange={() => onToggleSelected(localId)} aria-label="בחירת נכס" /> : null}</td>}
                  {visible.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'address' && 'text-foreground', id === 'price' && 'whitespace-nowrap max-sm:sticky max-sm:left-0 max-sm:z-[3] max-sm:bg-card', id === 'price' && (card.deal_type === 'rent' ? 'text-sale' : 'text-success'), id === 'floor' && 'whitespace-nowrap', (id === 'rooms' || id === 'sqm' || id === 'floor') && 'text-[16px]')}>
                    {id === 'photo' ? (
                      <div className="relative w-12">
                        {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded bg-muted" />}
                        {(card.photos?.length ?? 0) > 1 && <span aria-label={`${card.photos!.length} תמונות`} className="absolute right-0.5 top-0.5 rounded bg-foreground/70 px-1 text-[9px] font-semibold leading-tight text-background">{card.photos!.length}</span>}
                        {localId && <span title="שלי" aria-label="שלי" className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-br rounded-tl bg-white/80 text-success"><BadgeCheck className="h-3 w-3" aria-hidden="true" /></span>}
                      </div>
                    ) : id === 'address' ? <div className="w-44 min-w-0 max-w-[11rem] sm:w-64 sm:max-w-[16rem]"><PublicCardSummary card={card} showCommissions={false} showBroker={false} dense /></div>
                    : id === 'price' ? <span className="text-[17px] font-bold">{shekel(card.price)}{card.deal_type === 'rent' && card.price ? <span className="ms-1 text-xs font-normal"> / לחודש</span> : null}</span>
                    : id === 'commissions' ? (localId ? <PropertyCommissionIcons table listingId={localId} raw={{}} /> : null)
                    : id === 'rooms' ? card.rooms || ''
                    : id === 'sqm' ? card.sqm || ''
                    : card.floor != null ? `${card.floor}` : ''}
                  </td>)}
                  <td className="p-2 align-bottom" onClick={e => e.stopPropagation()}><div className="flex items-center justify-end gap-1">
                    {localId && <PropertyShareMenu results={[result]} iconOnly variant="ghost" hidePublish hideOpenPage />}
                    {localId && quickPromotion(result)}
                    {localId && <Button type="button" size="icon" variant="ghost" onClick={() => onFavorite(localId)} aria-label={favoriteIds.has(localId) ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} aria-pressed={favoriteIds.has(localId)} className="h-8 w-8 text-destructive"><Heart className={cn('h-4 w-4', favoriteIds.has(localId) && 'fill-current')} /></Button>}
                  </div></td>
                </tr>,
                <tr key={`${result.key}-x`} className="bg-muted/10">
                  <td colSpan={visible.length + 1 + (selectionMode ? 1 : 0)} className="p-0">
                    <AnimatedExpansion open={open}>
                      <div className="sticky right-0 min-w-0 space-y-3 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                        {open && (localId
                          ? <ExpandedPropertyDetails gallery={<PropertyGallerySlider photos={card.photos} alt={title} />} idOrSlug={localId} isFav={favoriteIds.has(localId)} onFavorite={() => onFavorite(localId)} />
                          : <><PropertyGallerySlider photos={card.photos} alt={title} />{card.description && <p className="whitespace-pre-line text-sm text-foreground">{card.description}</p>}</>)}
                      </div>
                    </AnimatedExpansion>
                    {open && localId && <PropertyContactActions listingId={localId} title={title} dealType={card.deal_type} premsg={ritaPropertyPremsg(card)} options={card.contact_options} formAsButton compact className="mx-3 mb-1 lg:mx-5" style={wrapWidth ? { width: `calc(${wrapWidth}px - 24px)` } : undefined} />}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </HorizontalTableScroll>
    </BoardColumnDragArea>
  );
}
