import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Bed, ChevronLeft, ChevronRight, Heart, Layers, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { publicAdDescription, publicAdTitle } from '@/lib/publicAdPresentation';
import { publicUrl } from '@/lib/publicUrl';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import PublicCardSummary from './PublicCardSummary';
import PropertyContactActions from './PropertyContactActions';
import type { PublicCard } from '@/pages/PublicListingsBoard';

function PhotoCarousel({ photos, alt, card, onFavorite, isMine = false, isFav = false }: { photos: string[]; alt: string; card: PublicCard; onFavorite: () => void; isMine?: boolean; isFav?: boolean }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const move = (delta: number) => setIndex((current) => (current + delta + photos.length) % photos.length);
  return (
    <div>
      <div data-property-image-toolbar className="flex min-h-10 items-center gap-1 px-2" onClick={(event) => event.stopPropagation()}>
        {photos.length > 1 && <><Button type="button" size="icon" variant="ghost" aria-label="תמונה קודמת" onClick={() => move(-1)} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label="תמונה הבאה" onClick={() => move(1)} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button></>}
      </div>
      <div className="relative h-48 overflow-hidden bg-muted [touch-action:pan-y]" onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }; swiped.current = false; }} onTouchEnd={(event) => { const start = touchStart.current; const touch = event.changedTouches[0]; touchStart.current = null; if (!start || !touch || photos.length < 2) return; const dx = touch.clientX - start.x; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(touch.clientY - start.y)) { swiped.current = true; move(dx > 0 ? 1 : -1); } }} onClickCapture={(event) => { if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}>
        {photos.length ? <img src={photos[index]} alt={alt} loading="lazy" draggable={false} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין תמונות</div>}
        <div className="absolute left-2 top-2 z-10 rounded-full bg-white/70 p-0.5" onClick={(event) => event.stopPropagation()}>
          <Button type="button" size="icon" variant="ghost" onClick={onFavorite} aria-label={isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" aria-pressed={isFav} className="h-9 w-9 text-destructive"><Heart className={cn('h-5 w-5', isFav && 'fill-current')} /></Button>
        </div>
        {photos.length > 1 && <span className="absolute right-2 top-2 z-10 rounded-full bg-white/70 px-2 py-1 text-xs font-semibold tabular-nums text-foreground" onClick={(event) => event.stopPropagation()}>{index + 1}/{photos.length}</span>}
        {isMine && <span title="המודעה שלי" aria-label="המודעה שלי" className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-semibold text-success" onClick={(event) => event.stopPropagation()}><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />שלי</span>}
      </div>
    </div>
  );
}

export default function StandardPropertyCard({ card, signedIn = false, isMine = false, isFav = false, onFavorite, actions, summary }: {
  card: PublicCard; signedIn?: boolean; isMine?: boolean; isFav?: boolean;
  onFavorite: () => void; actions?: ReactNode; summary?: ReactNode;
}) {
  const navigate = useNavigate();
  const title = publicAdTitle(card);
  const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
  const price = typeof card.price === 'number' && card.price > 0 ? `₪${card.price.toLocaleString('he-IL')}` : 'מחיר לא צוין';
  return <article role="link" tabIndex={0} aria-label={`פתיחת ${title}`} onClick={() => navigate(propertyPath)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(propertyPath); } }} className="flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="p-3"><div className="flex items-start gap-1"><div className="min-w-0 flex-1">{summary ?? <PublicCardSummary card={card} price={price} />}</div>{signedIn ? <div className="-me-2 -mt-1 shrink-0"><OwnerListingActions listingId={card.id} /></div> : null}</div></div>
                <PhotoCarousel card={card} photos={card.photos} alt={title} onFavorite={() => onFavorite()} isMine={isMine} isFav={isFav} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {!!card.rooms && <span className="inline-flex items-center gap-1"><Bed className="h-3.5 w-3.5 text-primary" />{card.rooms} חדרים</span>}
                    {!!card.sqm && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-primary" />{card.sqm} מ״ר</span>}
                    {card.floor != null && <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{card.floor === 0 ? 'קרקע' : `קומה ${card.floor}`}{card.total_floors ? ` מתוך ${card.total_floors}` : ''}</span>}
                  </div>
                  {publicAdDescription(card.description, card.title) && <p className="line-clamp-3 text-xs text-muted-foreground">{publicAdDescription(card.description, card.title)}</p>}
                   <div data-card-contact-actions className="mt-auto pt-1">
                     {actions}
                     <PropertyContactActions
                       listingId={card.id}
                       dealType={card.deal_type}
                       title={title}
                       premsg={ritaPropertyPremsg(card)}
                       options={card.contact_options}
                       compact
                       formAsButton
                        shareUrl={publicUrl(propertyPath)}
                        showShare={false}
                     />
                   </div>
                </div>
              </article>;
}
