import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, GripVertical, Heart, LayoutGrid, List, Search, Send, X } from 'lucide-react';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, boardLeadPriceBounds, leadFilterActiveCount, propertyFilterActiveCount, matchesPropertyFilter, matchesLeadFilter, leadTierAmounts, type PropertyFilterState } from '@/lib/leadTypeFilter';
import { WelcomeSlides } from '@/components/public/WelcomeSlides';
import { boardCache } from '@/lib/boardCache';
import { listingDetailIdentifier } from '@/lib/publicListingLookup';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import { WELCOME_REOPEN_EVENT, shouldShowWelcome } from '@/lib/welcomePreference';
import { readPostSignupWelcome } from '@/lib/signupRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { HorizontalTableScroll } from '@/components/ui/horizontal-table-scroll';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';
import BrokerageCommissionDisclosure from '@/components/public/BrokerageCommissionDisclosure';
import PropertyContactActions from '@/components/public/PropertyContactActions';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { publicUrl } from '@/lib/publicUrl';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import PublicCardSummary, { PublicCardPublisher } from '@/components/public/PublicCardSummary';
import PropertyCommissionIcons from '@/components/public/PropertyCommissionIcons';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import type { LeadContactOptions } from '@/lib/leadTiers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu } from '@/components/public/PublicBoardTableControls';
import { propertyInquiryRef } from '@/lib/propertyReferral';
import InquiryVerificationDialog, { inquiryDeviceId, type InquiryChallenge } from '@/components/public/InquiryVerificationDialog';
import { GuestSignupDialog } from '@/components/public/GuestSignupDialog';
import BoardSearchOverlay, { BOARD_SEARCH_OPEN_EVENT, BOARD_SEARCH_STATE_EVENT, BOARD_VIEW_TOGGLE_EVENT, BOARD_VIEW_STATE_EVENT } from '@/components/public/BoardSearchOverlay';
import { SortDropdown } from '@/components/ui/sort-dropdown';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { sortListingRows, type ListingSortValue } from '@/lib/listingSortOptions';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { BoardPublishButton, BoardOpenPageButton } from '@/components/properties/BoardRowButtons';
import type { UnifiedResult } from '@/lib/propertySearch';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { visibleToListingAudience } from '@/lib/listingAudience';

export type PublicCard = {
  id: string; slug: string | null; title: string | null; city: string | null; neighborhood: string | null;
  street: string; house_number?: string | null; apartment_number?: string | null; deal_type: string | null; rooms: number | null; sqm: number | null; floor: number | null; total_floors: number | null;
  price: number | null; description: string | null; photos: string[];
  contact_options: LeadContactOptions | null;
  affiliate_enabled?: boolean;
  reward_types?: { form: boolean; whatsapp: boolean; phone: boolean; closing: boolean };
  closing_level?: number | null;
  property_type?: string | null;
  features?: Record<string, unknown>;
  affiliate_tier1_amount?: number;
  affiliate_tier2_amount?: number;
  affiliate_tier3_amount?: number;
  affiliate_tier4_amount?: number;
  affiliate_tier4_type?: 'fixed' | 'percent';
  reward_levels?: { form: number | null; whatsapp: number | null; phone: number | null } | null;
  attribution?: { broker_name?: string | null; office_name?: string | null; agency_logo_url?: string | null; broker_license_number?: string | null; publisher_kind?: string | null };
};

type GateIntent = 'favorite' | 'details';
const shekel = (n: number | null) => typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';
function cleanTitle(card: PublicCard) { return publicAdTitle(card); }
// Every table row exposes the same action set; the buttons work straight from the card data.
function cardResult(card: PublicCard): UnifiedResult {
  return {
    key: `board:${card.id}`,
    source: 'mine',
    sources: ['mine'],
    localId: card.id,
    title: cleanTitle(card),
    price: card.price,
    city: card.city,
    address: card.street,
    neighborhood: card.neighborhood,
    rooms: card.rooms,
    size_sqm: card.sqm,
    photos: card.photos ?? [],
    url: null,
    listing_type: card.deal_type === 'rent' ? 'rent' : 'sale',
    property_type: null,
  };
}

export default function PublicListingsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { level4Unlocked } = useAffiliateLicense();
  const [cards, setCards] = useState<PublicCard[]>(() => boardCache.get<PublicCard>() ?? []);
  const [visibleCount, setVisibleCount] = useState(24);
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
  }, [user?.id, activeWorkspaceId]);
  const [loading, setLoading] = useState(() => !boardCache.get());
  const [query, setQuery] = useState('');
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState<number | null>(null);
  // The table box keeps the browser's own horizontal scroll bar as its only one.
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setWrapWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { ro.disconnect(); };
  });

  const [grid, setGrid] = useState(() => {
    try { return localStorage.getItem('public-board-view') !== 'list'; } catch { return true; }
  });
  const toggleGrid = () => setGrid((value) => {
    const next = !value;
    try { localStorage.setItem('public-board-view', next ? 'grid' : 'list'); } catch { /* ignore */ }
    return next;
  });
  // Same sorting menu as "הנכסים שלי": the choice is kept per board visit.
  const [sortBy, setSortBy] = useState<ListingSortValue>('newest');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const openSearch = () => setSearchOpen((v) => !v);
    const toggle = () => toggleGrid();
    // A buyer/renter picked in "מי מפרסם?" opens the search already limited to their deal type.
    const seekerIntent = (e: Event) => {
      const deal = (e as CustomEvent<{ dealType?: string }>).detail?.dealType;
      if (deal === 'sale' || deal === 'rent') setPropFilter((cur) => ({ ...cur, dealType: deal as typeof cur.dealType }));
      setSearchOpen(true);
    };
    window.addEventListener(BOARD_SEARCH_OPEN_EVENT, openSearch);
    window.addEventListener(BOARD_VIEW_TOGGLE_EVENT, toggle);
    window.addEventListener('toraff:board-seeker-intent', seekerIntent);
    return () => { window.removeEventListener(BOARD_SEARCH_OPEN_EVENT, openSearch); window.removeEventListener(BOARD_VIEW_TOGGLE_EVENT, toggle); window.removeEventListener('toraff:board-seeker-intent', seekerIntent); };
  }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent(BOARD_VIEW_STATE_EVENT, { detail: { grid } })); }, [grid]);
  // Favorite listings of the signed-in user. The card heart, the table heart and
  // the "ניהול המודעה שלי" menu all read this one cached list.
  const { favoriteIds: favIds, toggleFavorite: saveFavorite } = useListingFavorites();
  const toggleFavorite = async (card: PublicCard) => {
    if (!user?.id) { setGuestDialog(true); return; }
    await saveFavorite(card.id);
  };
  // Only protected favorite/reordering actions require registration.
  const [guestDialog, setGuestDialog] = useState(false);
  const blockGuests = (e: ReactMouseEvent | ReactPointerEvent) => {
    if (user) return;
    e.preventDefault();
    e.stopPropagation();
    setGuestDialog(true);
  };
  const [gate, setGate] = useState<{ card: PublicCard; intent: GateIntent } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [sending, setSending] = useState(false);
  const [challenge, setChallenge] = useState<InquiryChallenge | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: 'rita' | 'visitor'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unlocked, setUnlocked] = useState<any | null>(null);
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [propFilter, setPropFilter] = useState<PropertyFilterState>(EMPTY_PROPERTY_FILTER);
  const appliedFilterCount = leadFilterActiveCount(leadFilter) + propertyFilterActiveCount(propFilter);
  const resetFilters = () => { setLeadFilter(EMPTY_LEAD_FILTER); setPropFilter(EMPTY_PROPERTY_FILTER); setQuery(''); };
  useEffect(() => { window.dispatchEvent(new CustomEvent(BOARD_SEARCH_STATE_EVENT, { detail: { open: searchOpen, count: appliedFilterCount } })); }, [searchOpen, appliedFilterCount]);
  const [expandedId, setExpandedId] = useState<string | null>(null);


  const loadGeneration = useRef(0);
  const load = async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const fresh = await fetchPublicBoardFeed();
      if (generation !== loadGeneration.current) return;
      setCards(fresh); boardCache.set(fresh);
    } catch { if (generation === loadGeneration.current) toast.error('לא ניתן לטעון את לוח הנכסים'); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  };

  useEffect(() => {
    setCards([]); boardCache.clear(); setLeadFilter(EMPTY_LEAD_FILTER);
    void load();
    return () => { loadGeneration.current += 1; };
  }, [user?.id, activeWorkspaceId, level4Unlocked]);

  const openGate = (card: PublicCard, intent: GateIntent) => { setGate({ card, intent }); setToken(null); setUnlocked(null); setChat([]); };

  const submitGate = async (verification?: { id: string; answers: Record<string, string> }) => {
    if (!gate) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 9) { toast.error('נא למלא שם ומספר ווטסאפ תקין'); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', { body: { action: 'register', listing_id: gate.card.id, name: form.name.trim(), phone: form.phone.trim(), intent: gate.intent, ref: propertyInquiryRef(), device_id: inquiryDeviceId(), verification } });
    setSending(false);
    const payload = data as any;
    if (!error && payload?.verify) { if (payload.error) toast.error(payload.error); setChallenge(payload.verify); return; }
    setChallenge(null);
    if (error || !payload?.token) {
      let msg = payload?.error;
      const ctx = (error as { context?: Response } | null)?.context;
      if (!msg && ctx && typeof ctx.json === 'function') { try { msg = (await ctx.clone().json())?.error; } catch { /* non-JSON */ } }
      console.error('[PublicListingsBoard] lead submission failed', { listingId: gate.card.id, error, msg });
      toast.error(msg || 'שליחת הפרטים נכשלה, אנא נסו שוב');
      return;
    }
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

  const [showWelcome, setShowWelcome] = useState(() => !readPostSignupWelcome() && shouldShowWelcome('home'));
  const [welcomeKey, setWelcomeKey] = useState(0);
  useEffect(() => {
    setShowWelcome(!readPostSignupWelcome() && shouldShowWelcome('home'));
    setWelcomeKey((key) => key + 1);
  }, [location.key]);
  useEffect(() => {
    const reopen = () => { if (!shouldShowWelcome('logo')) return; setWelcomeKey((key) => key + 1); setShowWelcome(true); };
    window.addEventListener(WELCOME_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(WELCOME_REOPEN_EVENT, reopen);
  }, []);
  const filtered = useMemo(() => cards.filter((card) => {
    if (!visibleToListingAudience(card.reward_types, !!user, level4Unlocked)) return false;
    if (query.trim() && ![card.title, card.street, card.city, card.neighborhood].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))) return false;
    return matchesPropertyFilter(card as unknown as Record<string, unknown>, propFilter) && matchesLeadFilter(leadTierAmounts(card as unknown as Record<string, unknown>), leadFilter);
  }), [cards, propFilter, query, leadFilter, user, level4Unlocked]);
  // Custom row order chosen with the drag handle, saved per user/workspace on this device.
  const rowOrderKey = `public-board-row-order:v1:${user?.id || 'guest'}:${activeWorkspaceId || 'public'}`;
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(rowOrderKey) || '[]'); setRowOrder(Array.isArray(v) ? v.filter((x: unknown) => typeof x === 'string') : []); } catch { setRowOrder([]); } }, [rowOrderKey]);
  const ordered = useMemo(() => {
    if (!rowOrder.length) return filtered;
    const rank = new Map(rowOrder.map((id, i) => [id, i]));
    const fresh = filtered.filter(c => !rank.has(c.id));
    return [...fresh, ...filtered.filter(c => rank.has(c.id)).sort((a, b) => (rank.get(a.id) as number) - (rank.get(b.id) as number))];
  }, [filtered, rowOrder]);
  // The sort menu owns the row order: "relevance" keeps the viewer's own dragged
  // order, "newest" keeps the server's newest-first feed order, the rest compare
  // price, rooms or area exactly like the property page does.
  const sortedRows = useMemo(
    () => sortListingRows(sortBy === 'newest' ? filtered : ordered, sortBy),
    [filtered, ordered, sortBy],
  );
  const columns = usePublicBoardColumns(`${user?.id || 'guest'}:${activeWorkspaceId || 'public'}`, sortedRows);
  const rowDrag = useRef<{ id: string; pointerId: number } | null>(null);
  // Floating preview + target highlight while a property row is dragged to a new position.
  const [dragGhost, setDragGhost] = useState<{ id: string; x: number; y: number; overId: string | null } | null>(null);
  const moveRowDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = rowDrag.current; if (!drag || drag.pointerId !== e.pointerId) return;
    const overId = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row-id]')?.dataset.rowId ?? null;
    setDragGhost({ id: drag.id, x: e.clientX, y: e.clientY, overId: overId === drag.id ? null : overId });
  };
  const finishRowDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = rowDrag.current; rowDrag.current = null;
    setDragGhost(null);
    if (!drag || drag.pointerId !== e.pointerId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
    if (!target || target === drag.id) return;
    const ids = columns.sorted.map(c => c.id).filter(id => id !== drag.id);
    const fromIndex = columns.sorted.findIndex(c => c.id === drag.id), toIndex = columns.sorted.findIndex(c => c.id === target);
    const at = ids.indexOf(target) + (fromIndex < toIndex ? 1 : 0);
    ids.splice(at, 0, drag.id);
    const next = [...ids, ...rowOrder.filter(id => !ids.includes(id))];
    setRowOrder(next);
    try { localStorage.setItem(rowOrderKey, JSON.stringify(next)); } catch { /* storage disabled */ }
  };
  useEffect(() => { setVisibleCount(24); }, [query, propFilter, leadFilter, grid, sortBy]);
  // Guest reward indicators disclose configured types, never prices.
  const visibleColumns = columns.visible;
  const priceBounds = useMemo(() => { const p = cards.map(c => Number(c.price)).filter(v => Number.isFinite(v) && v > 0); return p.length ? { min: Math.min(...p), max: Math.max(...p) } : null; }, [cards]);
  const rewardBounds = useMemo(() => boardLeadPriceBounds(cards as unknown as Record<string, unknown>[]), [cards]);
  const cities = useMemo(() => [...new Set(cards.map((c) => c.city).filter(Boolean) as string[])].sort(), [cards]);
  const neighborhoods = useMemo(() => [...new Set(cards.map((c) => c.neighborhood).filter(Boolean) as string[])].sort(), [cards]);

  return (
    <div dir="rtl" className={cn('flex min-h-0 flex-col overflow-hidden bg-background', embedded ? 'h-full' : 'public-board-page h-[100dvh]')}>
      {showWelcome && (
        <div className={cn('fixed inset-x-0 bottom-0 z-40 overflow-hidden overscroll-none bg-background', embedded ? 'top-16' : 'top-14 sm:top-16')}>
          <div className={cn('mx-auto w-full max-w-6xl', embedded ? 'app-content-width px-[15px] sm:px-0' : 'px-[15px]')}>
            <WelcomeSlides key={welcomeKey} onDone={() => setShowWelcome(false)} />
          </div>
        </div>
      )}
      <header className="relative z-20 shrink-0 bg-card">
        <div className={cn('mx-auto w-full max-w-6xl pb-0 pt-2', embedded ? 'px-0' : 'px-[15px]')}>
          {embedded ? null : (
            <div className="relative z-50 grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-x-2 bg-card sm:gap-x-3">
              <h1 className="sr-only">לוח שיווק שותפים</h1>
              <div className="flex items-center justify-start">
                <div className="relative shrink-0">
                  <Button variant="ghost" size="icon" className="board-header-icon-btn !h-[44px] !w-[44px] shrink-0" aria-label="חיפוש" onClick={() => setSearchOpen(v => !v)}><Search className="!h-[20px] !w-[20px]" strokeWidth={1.75} /></Button>
                  {searchOpen ? (
                    <button type="button" aria-label="סגירת החיפוש" onClick={() => setSearchOpen(false)} className="absolute -top-1 -right-1 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm">
                      <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </button>
                  ) : appliedFilterCount > 0 ? <span aria-label={`${appliedFilterCount} סינונים פעילים`} className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">{appliedFilterCount}</span> : null}
                </div>
                <Button variant="ghost" size="icon" className="board-header-icon-btn !h-[44px] !w-[44px] shrink-0" onClick={toggleGrid} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="!h-[18px] !w-[18px]" /> : <LayoutGrid className="!h-[18px] !w-[18px]" />}</Button>
              </div>
              <Button variant="ghost" className="h-auto shrink-0 justify-self-center p-0 hover:bg-transparent" aria-label="TORAFF - דף הבית" onClick={() => { if (!shouldShowWelcome('logo')) return; setWelcomeKey((key) => key + 1); setShowWelcome(true); }}><PlatformBrand className="h-[52px] shrink-0 sm:h-[65px]" /></Button>
              <div className="flex items-center justify-end">
                <PublicListingPublisher autoResume triggerClassName="!w-[88px] sm:!w-[114px] !px-1 !text-[17px] sm:!text-[20px]" />
              </div>
            </div>
          )}
          {/* Signed-in home: the controls bar sits right under the site title and
              above the search panel and the listings — search at the far right,
              sorting next to the view toggle at the far left, exactly like
              "הנכסים שלי". No count by default. The search panel grows below it,
              so this row never moves when the panel opens. */}
          {embedded && (
            <div className="flex shrink-0 items-center justify-between gap-0" style={{ marginInlineEnd: '-5px' }}>
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-9 border-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-primary"
                  aria-label="חיפוש"
                  onClick={() => setSearchOpen((value) => !value)}
                >
                  <Search className="h-4 w-4" />
                </Button>
                {searchOpen ? (
                  <button type="button" aria-label="סגירת החיפוש" onClick={() => setSearchOpen(false)} className="absolute -top-1 -right-1 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm">
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>
                ) : appliedFilterCount > 0 ? <span aria-label={`${appliedFilterCount} סינונים פעילים`} className="pointer-events-none absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">{appliedFilterCount}</span> : null}
              </div>
              <div className="flex shrink-0 items-center gap-0">
                <SortDropdown value={sortBy} onChange={setSortBy} />
                <ViewModeSwitch isGrid={grid} onToggle={toggleGrid} />
              </div>
            </div>
          )}
          <BoardSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} query={query} onQueryChange={setQuery} onSearch={() => void load()} resultCount={filtered.length} dealType={propFilter.dealType} onDealTypeChange={dealType => setPropFilter({ ...propFilter, dealType: dealType as typeof propFilter.dealType })} filters={<LeadTypeFilterButton panelOnly hideDealType state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} priceBounds={priceBounds} rewardBounds={rewardBounds} />} />
        </div>
      </header>

      <main aria-label="רשימת נכסים" className={cn('mx-auto min-h-0 w-full min-w-0 max-w-6xl flex-1 overscroll-contain pb-0 pt-[15px]', embedded ? 'px-0' : 'px-[15px]', grid || loading || filtered.length === 0 ? 'overflow-y-auto' : 'flex flex-col overflow-hidden')}>
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">טוען נכסים…</p> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center gap-4 py-16 text-center"><p className="text-sm text-muted-foreground">לא נמצאו נכסים מתאימים</p>{(appliedFilterCount > 0 || query.trim()) && <Button type="button" onClick={resetFilters}>איפוס סינונים</Button>}</div> : (
          grid ? (
          <div className="property-card-grid">
            {sortedRows.slice(0, visibleCount).map(card => <StandardPropertyCard key={card.id} card={card} signedIn={!!user} isMine={ownedIds.has(card.id)} isFav={favIds.has(card.id)} onFavorite={() => void toggleFavorite(card)} />)}
          </div>
          ) : (
            <BoardColumnDragArea controls={columns}>
            <HorizontalTableScroll ref={tableWrapRef} aria-label="טבלת נכסים" className="board-head-sticky flex-1 rounded-lg border bg-card">
              <table data-column-managed="true" className="w-max min-w-full text-sm">
                <thead className="bg-muted/40 text-[14px] text-muted-foreground">
                  <tr>
                    {visibleColumns.map((id) => <BoardColumnHeader key={id} id={id} controls={columns} />)}
                    <th className="w-10 p-0 pt-2 text-end"><div className="flex justify-end"><BoardColumnMenu controls={columns} /></div></th>
                  </tr>

                </thead>
                <tbody>
                  {columns.sorted.slice(0, visibleCount).map((card) => {
                    const title = cleanTitle(card);
                    const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
                    const open = expandedId === card.id;
                    const toggle = () => {
                      if (open) { setExpandedId(null); return; }
                      setExpandedId(card.id);
                      // AnimatedExpansion reveals the summary and details together once
                      // their final height is known; do not start a competing scroll here.
                    };
                    return [
                      <tr key={card.id} id={`row-${card.id}`} data-row-id={card.id} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className={cn('cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', dragGhost?.overId === card.id && 'bg-primary/10 ring-1 ring-inset ring-primary/50')}>
                        {visibleColumns.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'address' && 'text-foreground', id === 'price' && 'whitespace-nowrap', id === 'price' && (card.deal_type === 'rent' ? 'text-sale' : 'text-success'), id === 'price' && 'max-sm:sticky max-sm:left-0 max-sm:z-[3] max-sm:bg-card', id === 'floor' && 'whitespace-nowrap', (id === 'rooms' || id === 'sqm' || id === 'floor') && 'text-[16px]')}>
                          {id === 'photo' ? (
                          <div className="relative w-12">
                            {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded bg-muted" />}
                            {(card.photos?.length ?? 0) > 1 && <span aria-label={`${card.photos!.length} תמונות`} className="absolute right-0.5 top-0.5 rounded bg-foreground/70 px-1 text-[9px] font-semibold leading-tight text-background">{card.photos!.length}</span>}
                            {ownedIds.has(card.id) && <span title="המודעה שלי" aria-label="המודעה שלי" className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-br rounded-tl bg-white/80 text-success"><BadgeCheck className="h-3 w-3" aria-hidden="true" /></span>}
                          </div>
                          ) : id === 'address' ? <div className="w-[min(18rem,max(6.5rem,calc(100vw-14rem)))] min-w-0 max-w-[18rem] break-words [overflow-wrap:anywhere] sm:w-96 sm:max-w-[24rem]"><PublicCardSummary card={card} showCommissions={false} showBroker={false} dense /></div>
                          : id === 'price' ? <span className="text-[17px] font-bold max-sm:flex max-sm:flex-col max-sm:items-end max-sm:leading-tight">{shekel(card.price)}{card.deal_type === 'rent' && card.price ? <span className="ms-1 text-xs font-normal max-sm:ms-0"> / לחודש</span> : null}</span>
                          : id === 'commissions' ? <PropertyCommissionIcons table listingId={card.id} raw={{ reward_types: card.reward_types, closing_level: card.closing_level, reward_levels: card.reward_levels }} />
                          : id === 'rooms' ? card.rooms || ''
                          : id === 'sqm' ? card.sqm || ''
                          : id === 'publisher' ? <div className="w-48 max-w-[12rem]"><PublicCardPublisher card={card} /></div>
                          : card.floor != null ? `${card.floor}${card.total_floors ? `/${card.total_floors}` : ''}` : ''}
                        </td>)}
                        <td className="p-2 align-bottom"><div className="flex items-center justify-end gap-1">
                          {user ? <PropertyShareMenu results={[cardResult(card)]} iconOnly variant="ghost" hidePublish hideOpenPage /> : <PropertyContactActions listingId={card.id} title={title} compact shareOnly shareUrl={publicUrl(propertyPath)} shareButtonClassName="h-8 w-8 border-0 bg-transparent shadow-none" />}
                          <BoardPublishButton result={cardResult(card)} />
                          <BoardOpenPageButton result={cardResult(card)} publicPath={propertyPath} />
                          <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); void toggleFavorite(card); }} aria-label={favIds.has(card.id) ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" aria-pressed={favIds.has(card.id)} className="h-8 w-8 text-destructive"><Heart className={cn('h-4 w-4', favIds.has(card.id) && 'fill-current')} /></Button>
                          <Button type="button" size="icon" variant="ghost" aria-label="גרירה לשינוי סדר" title="גרירה לשינוי סדר" className="h-8 w-8 cursor-grab touch-none text-muted-foreground active:cursor-grabbing" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { if (!user) { blockGuests(event); return; } event.stopPropagation(); rowDrag.current = { id: card.id, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={moveRowDrag} onPointerUp={finishRowDrag} onPointerCancel={() => { rowDrag.current = null; setDragGhost(null); }}><GripVertical className="h-4 w-4" /></Button>
                        </div>
                         </td>
                      </tr>,
                      <tr key={`${card.id}-x`} className="bg-muted/10">
                        <td colSpan={visibleColumns.length + 1} className="p-0">
                          <AnimatedExpansion open={open}>
                          <div id={`details-${card.id}`} className="sticky right-0 min-w-0 space-y-4 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                            <div className="min-w-0 space-y-3">
                              {open && <ExpandedPropertyDetails gallery={<PropertyGallerySlider photos={card.photos} alt={title} isMine={ownedIds.has(card.id)} share={<PropertyContactActions listingId={card.id} dealType={card.deal_type} title={title} options={card.contact_options} compact shareOnly shareButtonClassName="h-7 w-7 rounded-full border-0 bg-white/70 hover:bg-white/90" shareUrl={publicUrl(propertyPath)} />} />} idOrSlug={listingDetailIdentifier(card)} onClose={() => setExpandedId(null)} isFav={favIds.has(card.id)} onFavorite={() => toggleFavorite(card)} hideRewards rewardFacts={{ reward_levels: card.reward_levels, closing_level: card.closing_level, reward_types: card.reward_types }} />}
                            </div>
                          </div>
                          </AnimatedExpansion>
                          {open && <PropertyContactActions listingId={card.id} title={title} dealType={card.deal_type} premsg={ritaPropertyPremsg(card)} options={card.contact_options} formAsButton compact showShare={false} className="sticky bottom-0 z-20 mx-3 mb-1 bg-card pb-2 pt-1 lg:mx-5" style={wrapWidth ? { width: `calc(${wrapWidth}px - 24px)` } : undefined} />}
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
                    
              {filtered.length > visibleCount && <AutoLoadSentinel key={visibleCount} onReach={() => setVisibleCount(count => count + 10)} />}
            </HorizontalTableScroll>
            </BoardColumnDragArea>
          )
        )}
        {!loading && grid && filtered.length > visibleCount && <AutoLoadSentinel key={visibleCount} onReach={() => setVisibleCount(count => count + 10)} />}
      </main>

      {dragGhost && (() => {
        const card = columns.sorted.find(c => c.id === dragGhost.id);
        if (!card) return null;
        return (
          <div dir="rtl" aria-hidden className="pointer-events-none fixed left-0 top-0 z-[70] w-56 rounded-lg border bg-card p-2 text-xs shadow-2xl ring-2 ring-primary/40 [will-change:transform]" style={{ transform: `translate(${dragGhost.x}px, ${dragGhost.y}px) translate(-50%, -50%) rotate(1.5deg)` }}>
            <div className="flex items-center gap-2">
              {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <div className="h-10 w-10 shrink-0 rounded bg-muted" />}
              <div className="min-w-0">
                <p className="break-words font-semibold">{cleanTitle(card)}</p>
                <p className="text-muted-foreground">{shekel(card.price)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      <GuestSignupDialog open={guestDialog} onOpenChange={setGuestDialog} returnTo={location.pathname + location.search} />

      <Dialog open={!!gate} onOpenChange={(open) => { if (!open) setGate(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right"><DialogTitle>השארת פרטים</DialogTitle><DialogDescription>ריטה תיצור איתכם מיד קשר בווטסאפ</DialogDescription></DialogHeader>
          {gate?.intent === 'details' && <BrokerageCommissionDisclosure audience={gate.card.deal_type === 'rent' ? 'renter' : gate.card.deal_type === 'sale' ? 'buyer' : null} />}
          {!token ? <div className="space-y-3">
            <Input placeholder="שם מלא" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="space-y-1"><label className="text-sm font-semibold">מספר ווטסאפ</label><Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <Button className="w-full" disabled={sending} onClick={() => void submitGate()}>{sending ? 'שולח…' : 'שלחו לי פרטים נוספים'}</Button>
            <InquiryVerificationDialog challenge={challenge} sending={sending} onClose={() => setChallenge(null)} onSubmit={(verification) => void submitGate(verification)} />
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

function AutoLoadSentinel({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) cb.current(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="h-px shrink-0" />;
}
