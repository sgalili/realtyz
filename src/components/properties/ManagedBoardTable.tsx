import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { FixedTablePanel, HorizontalTableScroll } from '@/components/ui/horizontal-table-scroll';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import PropertyContactActions from '@/components/public/PropertyContactActions';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import { QuickPublicPromotion, PublishStatusGlobe } from '@/components/properties/QuickPublicPromotion';
import PublicCardSummary from '@/components/public/PublicCardSummary';
import PropertyCommissionIcons from '@/components/public/PropertyCommissionIcons';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu } from '@/components/public/PublicBoardTableControls';
import { publicUrl } from '@/lib/publicUrl';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { UnifiedResult } from '@/lib/propertySearch';
import type { PublicCard } from '@/pages/PublicListingsBoard';

type Row = { card: PublicCard; result: UnifiedResult };

const shekel = (n?: number | null) => (n ? `₪${Number(n).toLocaleString('he-IL')}` : '');

/** /properties table: same columns, headers, rows and expansion as the homepage board, plus management tools. */
export default function ManagedBoardTable({ results, toCard, selectionMode, selectedIds, onToggleSelected, onSetSelected, favoriteIds, onFavorite, onPublished }: {
  results: UnifiedResult[];
  toCard: (r: UnifiedResult) => PublicCard;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onSetSelected?: (ids: Set<string>) => void;
  favoriteIds: Set<string>;
  onFavorite: (id: string) => void;
  onPublished: (ids: string[], live?: boolean) => void;
}) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const rows = useMemo<Row[]>(() => results.map(result => ({ result, card: toCard(result) })), [results, toCard]);
  const columns = usePublicBoardColumns<Row>(`managed:${user?.id || 'anon'}:${activeWorkspaceId || 'none'}`, rows, {
    columns: [
      { id: 'publish', label: 'פרסום' }, { id: 'photo', label: 'תמונה' }, { id: 'address', label: 'כותרת' }, { id: 'price', label: 'מחיר' }, { id: 'commissions', label: 'תגמולים' },
      { id: 'rooms', label: 'חדרים' }, { id: 'sqm', label: 'מ״ר' }, { id: 'floor', label: 'קומה' },
    ],
    value: ({ card, result }, id) => id === 'publish' ? (isLive(result.raw) ? 1 : 0) : id === 'price' ? card.price ?? null : id === 'rooms' ? card.rooms ?? null : id === 'sqm' ? card.sqm ?? null : id === 'floor' ? card.floor ?? null : id === 'address' ? publicAdTitle(card) : null,
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
              {selectionMode && (() => { const ids = results.map(r => r.localId).filter(Boolean) as string[]; const all = ids.length > 0 && ids.every(id => selectedIds.has(id)); return <th className="w-8 p-2"><Checkbox checked={all} aria-label={all ? 'ביטול בחירת הכל' : 'בחירת הכל'} onCheckedChange={() => onSetSelected ? onSetSelected(all ? new Set() : new Set(ids)) : ids.forEach(id => { if (all || !selectedIds.has(id)) onToggleSelected(id); })} /></th>; })()}
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
              const raw = (result.raw ?? {}) as Record<string, unknown>;
              const live = isLive(raw);
              return [
                <tr key={result.key} data-row-id={result.key} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className="cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {selectionMode && <td className="p-2" onClick={e => e.stopPropagation()}>{localId ? <Checkbox checked={selectedIds.has(localId)} onCheckedChange={() => onToggleSelected(localId)} aria-label="בחירת נכס" /> : null}</td>}
                  {visible.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'address' && 'text-foreground', id === 'price' && 'whitespace-nowrap', id === 'price' && (card.deal_type === 'rent' ? 'text-sale' : 'text-success'), id === 'floor' && 'whitespace-nowrap', (id === 'rooms' || id === 'sqm' || id === 'floor') && 'text-[16px]')}>
                    {id === 'publish' ? <div onClick={e => e.stopPropagation()}><QuickPublicPromotion ids={localId ? [localId] : []} compact statusLive={live} onPublished={onPublished} fallback={<PublishStatusGlobe live={live} />} /></div>
                    : id === 'photo' ? (
                      <div className="relative w-12">
                        {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded bg-muted" />}
                        {(card.photos?.length ?? 0) > 1 && <span aria-label={`${card.photos!.length} תמונות`} className="absolute right-0.5 top-0.5 rounded bg-foreground/70 px-1 text-[9px] font-semibold leading-tight text-background">{card.photos!.length}</span>}
                        {localId && <span title="שלי" aria-label="שלי" className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-br rounded-tl bg-white/80 text-success"><BadgeCheck className="h-3 w-3" aria-hidden="true" /></span>}
                      </div>
                    ) : id === 'address' ? <div className="w-72 min-w-0 max-w-[18rem] sm:w-96 sm:max-w-[24rem]"><PublicCardSummary card={card} showCommissions={false} showBroker={false} dense /></div>
                    : id === 'price' ? <span className="text-[17px] font-bold">{shekel(card.price)}{card.deal_type === 'rent' && card.price ? <span className="ms-1 text-xs font-normal"> / לחודש</span> : null}</span>
                    : id === 'commissions' ? (localId ? <PropertyCommissionIcons table listingId={localId} raw={{}} /> : null)
                    : id === 'rooms' ? card.rooms || ''
                    : id === 'sqm' ? card.sqm || ''
                    : card.floor != null ? `${card.floor}` : ''}
                  </td>)}
                  <td className="p-2 align-bottom" onClick={e => e.stopPropagation()}><div className="flex items-center justify-end gap-1">
                    {localId && <OwnerListingActions listingId={localId} />}
                  </div></td>
                </tr>,
                <tr key={`${result.key}-x`} className="bg-muted/10">
                  <td colSpan={visible.length + 1 + (selectionMode ? 1 : 0)} className="p-0">
                    <FixedTablePanel>
                    <AnimatedExpansion open={open}>
                      <div className="sticky right-0 min-w-0 space-y-3 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                        {open && (localId
                          ? <ExpandedPropertyDetails gallery={<PropertyGallerySlider photos={card.photos} alt={title} share={<PropertyContactActions listingId={localId} dealType={card.deal_type} title={title} options={card.contact_options} compact shareOnly shareButtonClassName="h-7 w-7 rounded-full border-0 bg-white/70 hover:bg-white/90" shareUrl={publicUrl(`/p/${card.slug || localId}`)} />} />} idOrSlug={localId} actions={<OwnerListingActions listingId={localId} />} isFav={favoriteIds.has(localId)} onFavorite={() => onFavorite(localId)} />
                          : <><PropertyGallerySlider photos={card.photos} alt={title} />{card.description && <p className="whitespace-pre-line text-sm text-foreground">{card.description}</p>}</>)}
                      </div>
                    </AnimatedExpansion>
                    {open && localId && <PropertyContactActions listingId={localId} title={title} dealType={card.deal_type} premsg={ritaPropertyPremsg(card)} options={card.contact_options} showShare={false} formAsButton compact className="sticky bottom-0 z-20 mx-3 border-t border-border bg-card py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:mx-5" style={wrapWidth ? { width: `calc(${wrapWidth}px - 24px)` } : undefined} />}
                    </FixedTablePanel>
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

function isLive(raw: unknown): boolean {
  const r = (raw ?? {}) as Record<string, unknown>;
  return r.is_published === true && r.affiliate_enabled !== false && (r.status == null || r.status === 'live');
}
