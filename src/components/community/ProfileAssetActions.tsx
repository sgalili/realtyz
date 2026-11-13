import { ExternalLink, Heart, MoreVertical, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import { publicUrl } from '@/lib/publicUrl';
import { toast } from '@/hooks/use-toast';

export const profileAssetPath = (card: { id: string; slug?: string | null }) => `/p/${encodeURIComponent(card.slug || card.id)}`;

/** Fast partner sharing: native share sheet when available, otherwise copies the public link. */
export async function quickShareAsset(title: string, path: string) {
  const url = publicUrl(path);
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    toast({ title: 'הקישור הועתק', description: 'אפשר להדביק ולשווק מיד' });
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') toast({ title: 'השיתוף נכשל', variant: 'destructive' });
  }
}

export function QuickShareButton({ title, path, label = false }: { title: string; path: string; label?: boolean }) {
  return <Button type="button" size={label ? 'sm' : 'icon'} variant="outline" className={label ? 'gap-1.5' : 'h-8 w-8'} aria-label="שיתוף מהיר" title="שיתוף מהיר" onClick={(e) => { e.stopPropagation(); void quickShareAsset(title, path); }}><Share2 className="h-4 w-4" />{label && 'שיתוף מהיר'}</Button>;
}

/** Owners (and Super Admin) get the full management menu; partners get viewer-safe actions. */
export function ProfileAssetMenu({ card, title, isOwner, isFav, onFavorite }: { card: { id: string; slug?: string | null }; title: string; isOwner: boolean; isFav: boolean; onFavorite: () => void }) {
  const navigate = useNavigate();
  if (isOwner) return <OwnerListingActions listingId={card.id} />;
  const path = profileAssetPath(card);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="אפשרויות נכס" title="אפשרויות נכס" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuLabel className="text-xs">אפשרויות שותף</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => void quickShareAsset(title, path)}><Share2 className="me-2 h-4 w-4" />שיתוף מהיר</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => navigate(path)}><ExternalLink className="me-2 h-4 w-4" />פתיחת הנכס</DropdownMenuItem>
      <DropdownMenuItem onSelect={onFavorite}><Heart className="me-2 h-4 w-4" />{isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
