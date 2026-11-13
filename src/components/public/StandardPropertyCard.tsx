import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bed, Heart, Layers, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { publicAdDescription, publicAdTitle } from '@/lib/publicAdPresentation';
import { publicUrl } from '@/lib/publicUrl';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import PublicCardSummary from './PublicCardSummary';
import PropertyContactActions from './PropertyContactActions';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import PropertyGallerySlider from './PropertyGallerySlider';

export default function StandardPropertyCard({ card, signedIn = false, isMine = false, isFav = false, onFavorite, actions, summary, onOpen, showContact = true, showOwnerMenu = true, selection, menu }: {
  card: PublicCard; signedIn?: boolean; isMine?: boolean; isFav?: boolean;
  onFavorite: () => void; actions?: ReactNode; summary?: ReactNode;
  /** Management views open their own detail page instead of the public one. */
  onOpen?: () => void;
  /** Contact buttons need a saved listing so inquiries reach its owner's Rita. */
  showContact?: boolean;
  showOwnerMenu?: boolean;
  selection?: ReactNode;
  /** Replaces the owner menu with a caller-provided role-aware menu. */
  menu?: ReactNode;
}) {
  const navigate = useNavigate();
  const title = publicAdTitle(card);
  const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
  const open = () => (onOpen ? onOpen() : navigate(propertyPath));
  const price = typeof card.price === 'number' && card.price > 0 ? `₪${card.price.toLocaleString('he-IL')}` : 'מחיר לא צוין';
  return <article role="link" tabIndex={0} aria-label={`פתיחת ${title}`} onClick={open} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }} className="flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="p-3"><div className="flex items-start gap-1">{selection}<div className="min-w-0 flex-1">{summary ?? <PublicCardSummary card={card} price={price} />}</div>{menu ? <div className="-me-2 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>{menu}</div> : signedIn && showOwnerMenu ? <div className="-me-2 -mt-1 shrink-0"><OwnerListingActions listingId={card.id} /></div> : null}</div></div>
                <PropertyGallerySlider key={card.id} compact photos={card.photos} alt={title} isMine={isMine} overlay={<Button type="button" size="icon" variant="ghost" onClick={onFavorite} aria-label={isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" aria-pressed={isFav} className="h-7 w-7 rounded-full text-destructive hover:bg-transparent"><Heart className={cn('h-4 w-4', isFav && 'fill-current')} /></Button>} share={showContact ? <PropertyContactActions listingId={card.id} dealType={card.deal_type} title={title} options={card.contact_options} compact shareOnly shareButtonClassName="h-7 w-7 rounded-full border-0 bg-background/70 hover:bg-background/90" shareUrl={publicUrl(propertyPath)} /> : undefined} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {!!card.rooms && <span className="inline-flex items-center gap-1"><Bed className="h-3.5 w-3.5 text-primary" />{card.rooms} חדרים</span>}
                    {!!card.sqm && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-primary" />{card.sqm} מ״ר</span>}
                    {card.floor != null && <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{card.floor === 0 ? 'קרקע' : `קומה ${card.floor}`}{card.total_floors ? ` מתוך ${card.total_floors}` : ''}</span>}
                  </div>
                  {publicAdDescription(card.description, card.title) && <p className="break-words text-xs text-muted-foreground">{publicAdDescription(card.description, card.title)}</p>}
                   <div data-card-contact-actions className="mt-auto pt-1">
                     {actions}
                     {showContact && <PropertyContactActions
                       listingId={card.id}
                       dealType={card.deal_type}
                       title={title}
                       premsg={ritaPropertyPremsg(card)}
                       options={card.contact_options}
                       compact
                       formAsButton
                       showShare={false}
                     />}
                   </div>
                </div>
              </article>;
}
