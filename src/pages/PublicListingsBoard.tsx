import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bed, ChevronDown, ChevronLeft, ChevronRight, BadgeCheck, Heart, Layers, LayoutGrid, List, Ruler, Send } from 'lucide-react';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, matchesPropertyFilter, type PropertyFilterState } from '@/lib/leadTypeFilter';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';
import PropertyContactActions from '@/components/public/PropertyContactActions';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { publicUrl } from '@/lib/publicUrl';
import PublicCardSummary from '@/components/public/PublicCardSummary';
import PublicAdHeading from '@/components/public/PublicAdHeading';
import { publicAdDescription, publicAdTitle } from '@/lib/publicAdPresentation';
import type { LeadContactOptions } from '@/lib/leadTiers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu } from '@/components/public/PublicBoardTableControls';

export type PublicCard = {
  id: string; slug: string | null; title: string | null; city: string | null; neighborhood: string | null;
  street: string; house_number?: string | null; apartment_number?: string | null; deal_type: string | null; rooms: number | null; sqm: number | null; floor: number | null; total_floors: number | null;
  price: number | null; description: string | null; photos: string[];
  contact_options: LeadContactOptions | null;
};

type GateIntent = 'favorite' | 'details';
const shekel = (n: number | null) => typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';
const dealLabel = (t: string | null) => t === 'rent' ? 'להשכרה' : 'למכירה';
function cleanTitle(card: PublicCard) { return publicAdTitle(card); }

function PhotoCarousel({ photos, alt, card, onFavorite, isMine = false, isFav = false }: { photos: string[]; alt: string; card: PublicCard; onFavorite: () => void; isMine?: boolean; isFav?: boolean }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const move = (delta: number) => setIndex((current) => (current + delta + photos.length) % photos.length);
  return (
    <div className="group relative h-48 overflow-hidden bg-muted [touch-action:pan-y]" onTouchStart={(event) => { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }; swiped.current = false; }} onTouchEnd={(event) => { const start = touchStart.current; const touch = event.changedTouches[0]; touchStart.current = null; if (!start || !touch || photos.length < 2) return; const dx = touch.clientX - start.x; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(touch.clientY - start.y)) { swiped.current = true; move(dx > 0 ? 1 : -1); } }} onClickCapture={(event) => { if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}>
      {photos.length ? <img src={photos[index]} alt={alt} loading="lazy" draggable={false} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין תמונות</div>}
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); onFavorite(); }} aria-label={isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title={isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} aria-pressed={isFav} className="h-9 w-9 rounded-full bg-background/50 text-destructive shadow-sm hover:bg-background/50"><Heart className={cn('h-5 w-5 transition-colors', isFav && 'fill-current')} /></Button>
        <PropertyContactActions listingId={card.id} title={alt} shareUrl={publicUrl(`/p/${encodeURIComponent(card.slug || card.id)}`)} compact shareOnly shareButtonClassName="h-9 w-9 rounded-full border-0 bg-background/50 text-foreground shadow-sm hover:bg-background/50" />
      </div>
      {(isMine || photos.length > 1) && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5">
          {photos.length > 1 && <span className="rounded-full bg-background/50 px-2 py-1 text-xs font-bold tabular-nums text-foreground shadow">({index + 1}/{photos.length})</span>}
          {isMine && (
            <span title="המודעה שלי" className="inline-flex items-center gap-1 rounded-full bg-background/50 px-2 py-1 text-xs font-bold text-primary shadow">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              שלי
            </span>
          )}
        </div>
      )}
      {photos.length > 1 && <>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה קודמת" onClick={(event) => { event.stopPropagation(); move(-1); }} className="absolute start-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/50 shadow hover:bg-background/50"><ChevronRight className="h-5 w-5" /></Button>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה הבאה" onClick={(event) => { event.stopPropagation(); move(1); }} className="absolute end-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/50 shadow hover:bg-background/50"><ChevronLeft className="h-5 w-5" /></Button>
      </>}
    </div>
  );
}

export default function PublicListingsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const goToAuth = () =>
    navigate('/auth', { state: { returnTo: location.pathname + location.search } });
  const [cards, setCards] = useState<PublicCard[]>([]);
  // Listings the signed-in poster owns (marked with the "שלי" badge on the card image).
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!user?.id) { setOwnedIds(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_my_ads_stats');
        if (cancelled) return;
        const ids = ((data ?? []) as Array<{ relation?: string; listing_id?: string }>)
          .filter((r) => r.relation === 'owned' && r.listing_id)
          .map((r) => r.listing_id as string);
        setOwnedIds(new Set(ids));
      } catch {
        if (!cancelled) setOwnedIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState({ sale: true, rent: true });
  const deal: 'all' | 'sale' | 'rent' = deals.sale && deals.rent ? 'all' : deals.sale ? 'sale' : 'rent';
  const toggleDeal = (key: 'sale' | 'rent') => setDeals((cur) => { const next = { ...cur, [key]: !cur[key] }; return next.sale || next.rent ? next : cur; });
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState<number | null>(null);
  const [scrollIndicator, setScrollIndicator] = useState({ width: 100, offset: 0 });
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => {
      setWrapWidth(el.clientWidth);
      const width = el.scrollWidth > 0 ? Math.min(100, el.clientWidth / el.scrollWidth * 100) : 100;
      const maxScroll = el.scrollWidth - el.clientWidth;
      setScrollIndicator({ width, offset: maxScroll > 0 ? Math.min(1, Math.abs(el.scrollLeft) / maxScroll) * (100 - width) : 0 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { ro.disconnect(); el.removeEventListener('scroll', update); };
  });
  const [grid, setGrid] = useState(() => {
    try { return localStorage.getItem('public-board-view') !== 'list'; } catch { return true; }
  });
  const toggleGrid = () => setGrid((value) => {
    const next = !value;
    try { localStorage.setItem('public-board-view', next ? 'grid' : 'list'); } catch { /* ignore */ }
    return next;
  });
  // Favorite listings of the signed-in user (heart on the card image).
  const [favIds, setFavIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!user?.id) { setFavIds(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('listing_favorites').select('listing_id').eq('user_id', user.id);
      if (!cancelled) setFavIds(new Set(((data ?? []) as Array<{ listing_id: string }>).map((r) => r.listing_id)));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const toggleFavorite = async (card: PublicCard) => {
    if (!user?.id) { openGate(card, 'favorite'); return; }
    const isFav = favIds.has(card.id);
    setFavIds((cur) => { const next = new Set(cur); if (isFav) next.delete(card.id); else next.add(card.id); return next; });
    const { error } = isFav
      ? await supabase.from('listing_favorites').delete().eq('user_id', user.id).eq('listing_id', card.id)
      : await supabase.from('listing_favorites').insert({ user_id: user.id, listing_id: card.id });
    if (error) {
      setFavIds((cur) => { const next = new Set(cur); if (isFav) next.add(card.id); else next.delete(card.id); return next; });
      toast.error('שמירת המועדף נכשלה, נסו שוב');
    } else {
      toast.success(isFav ? 'הנכס הוסר מהמועדפים' : 'הנכס נשמר במועדפים');
    }
  };
  const [gate, setGate] = useState<{ card: PublicCard; intent: GateIntent } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: 'rita' | 'visitor'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unlocked, setUnlocked] = useState<any | null>(null);
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [propFilter, setPropFilter] = useState<PropertyFilterState>(EMPTY_PROPERTY_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Owner action bar sticks to the viewport top while its expanded section is scrolled.
  const ownerBarRef = useRef<HTMLDivElement | null>(null);
  const ownerSectionRef = useRef<HTMLDivElement | null>(null);
  const [ownerBarStuck, setOwnerBarStuck] = useState(false);
  useEffect(() => {
    if (!expandedId) { setOwnerBarStuck(false); return; }
    const measure = () => {
      const bar = ownerBarRef.current;
      const section = ownerSectionRef.current;
      if (!bar || !section) { setOwnerBarStuck(false); return; }
      const barTop = bar.getBoundingClientRect().top;
      const sectionBottom = section.getBoundingClientRect().bottom;
      setOwnerBarStuck(barTop <= 0 && sectionBottom > 0);
    };
    document.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      document.removeEventListener('scroll', measure, { capture: true } as any);
      window.removeEventListener('resize', measure);
    };
  }, [expandedId]);

  // Draggable scroll bar under the table header row: dragging the thumb slides the table sideways.
  const thumbDrag = useRef<{ pointerId: number; startX: number; startNorm: number } | null>(null);
  const onBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = tableWrapRef.current;
    const track = e.currentTarget;
    const thumb = track.querySelector<HTMLElement>('[data-thumb]');
    if (!el || !thumb) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;
    const trackW = track.clientWidth;
    const thumbW = thumb.offsetWidth;
    let norm = scrollIndicator.width >= 100 ? 0 : scrollIndicator.offset / Math.max(0.001, 100 - scrollIndicator.width);
    if (!thumb.contains(e.target as Node)) {
      const rect = track.getBoundingClientRect();
      norm = Math.min(1, Math.max(0, (e.clientX - rect.left - thumbW / 2) / Math.max(1, trackW - thumbW)));
      el.scrollLeft = -norm * maxScroll;
    }
    thumbDrag.current = { pointerId: e.pointerId, startX: e.clientX, startNorm: norm };
    track.setPointerCapture(e.pointerId);
  };
  const onBarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = thumbDrag.current;
    const el = tableWrapRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    const thumb = e.currentTarget.querySelector<HTMLElement>('[data-thumb]');
    if (!thumb) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const span = Math.max(1, e.currentTarget.clientWidth - thumb.offsetWidth);
    const norm = Math.min(1, Math.max(0, drag.startNorm - (e.clientX - drag.startX) / span));
    el.scrollLeft = -norm * maxScroll;
  };
  const onBarPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (thumbDrag.current?.pointerId === e.pointerId) thumbDrag.current = null;
  };

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (deal !== 'all') params.set('deal_type', deal);
    const { data, error } = await supabase.functions.invoke(`public-listings-board?${params.toString()}`, { method: 'GET' });
    if (error) toast.error('לא ניתן לטעון את לוח הנכסים');
    setCards(error ? [] : (((data as any)?.properties ?? []) as PublicCard[]));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [deal]);

  useEffect(() => {
    if (!user?.id) return;
    const key = `public-board-google-prompt:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void supabase.from('social_connections').select('id').in('platform', ['gmail', 'google_calendar']).eq('is_connected', true).limit(1).then(({ data }) => {
      if (data?.length) return;
      toast('חברו Google לקבלת תיאומים ועדכונים אוטומטיים', { action: { label: 'לחיבור', onClick: () => { window.location.assign('/profile?tab=connections'); } } });
    });
  }, [user?.id]);

  const openGate = (card: PublicCard, intent: GateIntent) => { setGate({ card, intent }); setToken(null); setUnlocked(null); setChat([]); };

  const submitGate = async () => {
    if (!gate) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 9) { toast.error('נא למלא שם ומספר ווטסאפ תקין'); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', { body: { action: 'register', listing_id: gate.card.id, name: form.name.trim(), phone: form.phone.trim(), intent: gate.intent } });
    setSending(false);
    const payload = data as any;
    if (error || !payload?.token) { toast.error(payload?.error || 'השליחה נכשלה, נסו שוב'); return; }
    setToken(payload.token); setChat([{ role: 'rita', text: payload.greeting }]);
  };

  const sendToRita = async () => {
    const text = chatInput.trim();
    if (!text || !token) return;
    setChatInput(''); setChat((current) => [...current, { role: 'visitor', text }]);
    const { data } = await supabase.functions.invoke('public-lead-gate', { body: { action: 'rita', token, message: text } });
    const payload = data as any;
    if (payload?.reply) setChat((current) => [...current, { role: 'rita', text: String(payload.reply) }]);
    if (payload?.unlocked) {
      const result = await supabase.functions.invoke('public-lead-gate', { body: { action: 'details', token } });
      if ((result.data as any)?.property) setUnlocked(result.data);
    }
  };

  const filtered = useMemo(() => cards.filter((card) => matchesPropertyFilter(card as unknown as Record<string, unknown>, propFilter)), [cards, propFilter]);
  const columns = usePublicBoardColumns(`${user?.id || 'guest'}:${activeWorkspaceId || 'public'}`, filtered);
  const cities = useMemo(() => [...new Set(cards.map((c) => c.city).filter(Boolean) as string[])].sort(), [cards]);
  const neighborhoods = useMemo(() => [...new Set(cards.map((c) => c.neighborhood).filter(Boolean) as string[])].sort(), [cards]);

  return (
    <div dir="rtl" className={embedded ? "bg-background" : "min-h-screen bg-background"}>
      <header className="bg-card">
        <div className="mx-auto max-w-6xl px-4 pb-0 pt-5">
          {embedded ? null : (
            <div className="relative flex min-h-11 items-center justify-between gap-2">
              <PublicListingPublisher autoResume />
              <h1 className="pointer-events-none absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 text-center text-base font-bold text-foreground sm:w-auto sm:text-2xl">לוח נדל״ן שיתופי</h1>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {!user && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={goToAuth}
                    className="h-8 rounded-full px-3 text-xs font-semibold sm:h-9 sm:px-4 sm:text-sm"
                  >
                    <span className="sm:hidden">התחברות</span>
                    <span className="hidden sm:inline">הרשמה / התחברות</span>
                  </Button>
                )}
                <img src={realtyzLogo} alt="Realtyz" className="h-8 w-auto object-contain sm:h-10" />
              </div>
            </div>
          )}
          <div className={cn('-ms-2.5 flex items-center gap-2', embedded ? '' : 'mt-5')}>
            <div className="relative min-w-0 max-w-md flex-1">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} placeholder="חיפוש חופשי" className="ps-9" />
              <span className="absolute start-1 top-1/2 flex -translate-y-1/2"><LeadTypeFilterButton state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} /></span>
            </div>
            <div className="inline-flex shrink-0 rounded-md bg-background py-1 ps-1">
              {([['sale', 'למכירה'], ['rent', 'להשכרה']] as const).map(([value, label]) => <Button key={value} size="sm" variant="ghost" aria-pressed={deals[value]} onClick={() => toggleDeal(value)} className={cn('gap-1.5 px-2 hover:bg-transparent hover:text-inherit focus-visible:bg-transparent', deals[value] ? 'font-semibold text-foreground hover:!text-foreground' : 'text-muted-foreground/60 hover:!text-muted-foreground/60')}><span className={cn('h-2 w-2 rounded-full', deals[value] ? (value === 'sale' ? 'bg-success' : 'bg-sale') : 'bg-muted-foreground/30')} />{label}</Button>)}
            </div>
            {query.trim() ? <Button type="button" className="shrink-0" onClick={() => void load()}>חיפוש</Button> : null}
            <Button className="ms-auto shrink-0" size="icon" variant="outline" onClick={toggleGrid} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6">
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">טוען נכסים…</p> : filtered.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו נכסים מתאימים</p> : (
          grid ? (
          <div className={cn(grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : '')}>
            {filtered.map((card) => {
              const title = cleanTitle(card);
              const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
              return <article key={card.id} role="link" tabIndex={0} aria-label={`פתיחת ${title}`} onClick={() => navigate(propertyPath)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(propertyPath); } }} className={cn('cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !grid && 'grid grid-cols-[120px_1fr] sm:grid-cols-[240px_1fr]')}>
                <div className="p-3"><PublicCardSummary card={card} price={shekel(card.price)} /></div>
                <PhotoCarousel card={card} photos={card.photos} alt={title} onFavorite={() => toggleFavorite(card)} isMine={ownedIds.has(card.id)} isFav={favIds.has(card.id)} />
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {!!card.rooms && <span className="inline-flex items-center gap-1"><Bed className="h-3.5 w-3.5 text-primary" />{card.rooms} חדרים</span>}
                    {!!card.sqm && <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-primary" />{card.sqm} מ״ר</span>}
                    {card.floor != null && <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{card.floor === 0 ? 'קרקע' : `קומה ${card.floor}`}{card.total_floors ? ` מתוך ${card.total_floors}` : ''}</span>}
                  </div>
                  {publicAdDescription(card.description, card.title) && <p className="line-clamp-3 text-xs text-muted-foreground">{publicAdDescription(card.description, card.title)}</p>}
                   <div className="pt-1">
                     <PropertyContactActions
                       listingId={card.id}
                       title={title}
                       premsg={ritaPropertyPremsg(card)}
                       options={card.contact_options}
                       compact
                        shareUrl={publicUrl(propertyPath)}
                        showShare={false}
                     />
                   </div>
                </div>
              </article>;
            })}
          </div>
          ) : (
            <BoardColumnDragArea controls={columns}>
            <div ref={tableWrapRef} className="w-full min-w-0 max-w-[min(100%,calc(100vw-2rem))] overflow-x-auto overscroll-x-contain rounded-lg border bg-card [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]">
              <table data-column-managed="true" className="w-max min-w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {columns.visible.map(id => <BoardColumnHeader key={id} id={id} controls={columns} />)}
                    <th className="w-10 px-2 pb-0 pt-2"><BoardColumnMenu controls={columns} /></th>
                  </tr>
                  <tr>
                    <td colSpan={columns.visible.length + 1} className="p-0">
<div className="sticky start-0 px-3 pb-2 pt-[7px]" style={wrapWidth ? { width: wrapWidth } : undefined}>
                        {scrollIndicator.width < 99.5 && (
                          <div
                            className="relative h-[7px] cursor-grab touch-none select-none active:cursor-grabbing"
                            onPointerDown={onBarPointerDown}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={onBarPointerUp}
                            onPointerCancel={onBarPointerUp}
                          >
<div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-muted-foreground/15" />
                            <div data-thumb className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-muted-foreground/40 shadow-sm" style={{ width: `${scrollIndicator.width}%`, marginInlineStart: `${scrollIndicator.offset}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {columns.sorted.map((card) => {
                    const title = cleanTitle(card);
                    const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
                    const open = expandedId === card.id;
                    const toggle = () => setExpandedId(open ? null : card.id);
                    return [
                      <tr key={card.id} id={`row-${card.id}`} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className="cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {columns.visible.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'address' && 'text-foreground', id === 'price' && 'whitespace-nowrap', id === 'price' && (card.deal_type === 'rent' ? 'text-sale' : 'text-success'), id === 'floor' && 'whitespace-nowrap')}>
                          {id === 'photo' ? (
                          <div className="relative h-12 w-12">
                            {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-full w-full rounded object-cover" loading="lazy" /> : <div className="h-full w-full rounded bg-muted" />}
                            {ownedIds.has(card.id) && <span title="המודעה שלי" aria-label="המודעה שלי" className="absolute right-0 top-0 inline-flex rounded-full bg-background/90 p-0.5 text-primary shadow"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /></span>}
                          </div>
                          ) : id === 'address' ? <div className="w-72 min-w-0 max-w-[18rem]">{open ? <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><PublicAdHeading title={title} price={shekel(card.price)} dealType={card.deal_type} compact /></div>{user ? <OwnerListingActions listingId={card.id} /> : null}</div> : <PublicCardSummary card={card} showBroker={false} dense />}</div>
                          : id === 'deal' ? <span className={cn('whitespace-nowrap text-xs', card.deal_type === 'rent' ? 'text-sale' : 'text-success')}>{dealLabel(card.deal_type)}</span>
                          : id === 'price' ? (open ? null : shekel(card.price))
                          : id === 'rooms' ? card.rooms || ''
                          : id === 'sqm' ? card.sqm || ''
                          : card.floor != null ? `${card.floor}${card.total_floors ? `/${card.total_floors}` : ''}` : ''}
                        </td>)}
                        <td className="relative p-2 align-bottom">
                          <Button type="button" variant="ghost" size="icon" className="absolute bottom-0.5 left-0.5 h-7 w-7 text-muted-foreground/70 hover:bg-transparent hover:text-foreground" aria-label={`${open ? 'קיפול' : 'פתיחת'} ${title}`} aria-expanded={open} aria-controls={`details-${card.id}`} onClick={(event) => { event.stopPropagation(); toggle(); }}>
                            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
                          </Button>
                        </td>
                      </tr>,
                      <tr key={`${card.id}-x`} className="bg-muted/10">
                        <td colSpan={columns.visible.length + 1} className="p-0">
                          <AnimatedExpansion open={open}>
                          <div id={`details-${card.id}`} ref={open ? ownerSectionRef : undefined} className="sticky right-0 min-w-0 space-y-4 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                            <div className="min-w-0 space-y-3">
                              {open && <ExpandedPropertyDetails gallery={<PropertyGallerySlider photos={card.photos} alt={title} />} idOrSlug={card.slug || card.id} isFav={favIds.has(card.id)} onFavorite={() => toggleFavorite(card)} />}
                              <PropertyContactActions listingId={card.id} title={title} premsg={ritaPropertyPremsg(card)} options={card.contact_options} compact showShare={false} />
                            </div>
                          </div>
                          </AnimatedExpansion>
                          {open && user && ownerBarStuck && createPortal(
                            <div dir="rtl" className="fixed inset-x-0 top-0 z-50 border-b bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
                              <div className="mx-auto w-full max-w-xl">
                                <OwnerListingActions listingId={card.id} />
                              </div>
                            </div>,
                            document.body
                          )}
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
            </BoardColumnDragArea>
          )
        )}
      </main>

      <Dialog open={!!gate} onOpenChange={(open) => { if (!open) setGate(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right"><DialogTitle>השארת פרטים</DialogTitle><DialogDescription>ריטה תיצור איתכם מיד קשר בווטסאפ</DialogDescription></DialogHeader>
          {!token ? <div className="space-y-3">
            <Input placeholder="שם מלא" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="space-y-1"><label className="text-sm font-semibold">מספר ווטסאפ</label><Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <Button className="w-full" disabled={sending} onClick={() => void submitGate()}>{sending ? 'שולח…' : 'שלחו לי פרטים נוספים'}</Button>
          </div> : <div className="space-y-3">
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">{chat.map((message, index) => <p key={index} className={cn('max-w-[85%] break-words rounded-lg px-3 py-2 text-xs', message.role === 'rita' ? 'bg-card text-foreground' : 'ms-auto bg-primary text-primary-foreground')}>{message.text}</p>)}</div>
            <div className="flex gap-2"><Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sendToRita(); }} placeholder="כתבו לריטה מה חשוב לכם" /><Button size="icon" onClick={() => void sendToRita()} aria-label="שליחה"><Send className="h-4 w-4" /></Button></div>
            {unlocked?.property && <div className="space-y-1 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground"><p className="font-bold">הפרטים המלאים נפתחו</p><p>כתובת: {[unlocked.property.address, unlocked.property.house_number].filter(Boolean).join(' ')}</p>{unlocked.property.apartment_number && <p>דירה: {unlocked.property.apartment_number}</p>}<a className="inline-flex rounded-md bg-success px-3 py-2 font-semibold text-success-foreground" href={unlocked.contact?.whatsapp_url} target="_blank" rel="noopener noreferrer">פתיחת ווטסאפ</a></div>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
