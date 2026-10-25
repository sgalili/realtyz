import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, GripVertical, Heart, LayoutGrid, List, Send, CircleUserRound } from 'lucide-react';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, matchesPropertyFilter, matchesLeadFilter, leadTierAmounts, type PropertyFilterState } from '@/lib/leadTypeFilter';
import { WelcomeSlides } from '@/components/public/WelcomeSlides';
import { boardCache } from '@/lib/boardCache';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import { WELCOME_REOPEN_EVENT, shouldShowWelcome } from '@/lib/welcomePreference';
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
import BoardSearchControls from '@/components/public/BoardSearchControls';
import { useAffiliateMarketplace, useMyReferrals } from '@/hooks/useAffiliate';
import { useUserRole } from '@/hooks/useUserRole';
import { PartnerListingActions } from '@/pages/AffiliatePortal';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';

export type PublicCard = {
  id: string; slug: string | null; title: string | null; city: string | null; neighborhood: string | null;
  street: string; house_number?: string | null; apartment_number?: string | null; deal_type: string | null; rooms: number | null; sqm: number | null; floor: number | null; total_floors: number | null;
  price: number | null; description: string | null; photos: string[];
  contact_options: LeadContactOptions | null;
  affiliate_enabled?: boolean;
  reward_types?: { form: boolean; whatsapp: boolean; phone: boolean; closing: boolean };
  closing_level?: number | null;
  attribution?: { broker_name?: string | null; office_name?: string | null; agency_logo_url?: string | null; broker_license_number?: string | null; publisher_kind?: string | null };
};

type GateIntent = 'favorite' | 'details';
const shekel = (n: number | null) => typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';
function cleanTitle(card: PublicCard) { return publicAdTitle(card); }

export default function PublicListingsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const marketplace = useAffiliateMarketplace();
  const referrals = useMyReferrals();
  const { isAffiliate } = useUserRole();
  const consent = usePartnerConsent();
  const goToAuth = () =>
    navigate('/auth', { state: { returnTo: location.pathname + location.search } });
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
    if (!user?.id) { navigate('/auth', { state: { returnTo: location.pathname + location.search, tab: 'signup' } }); return; }
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
  const [challenge, setChallenge] = useState<InquiryChallenge | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: 'rita' | 'visitor'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unlocked, setUnlocked] = useState<any | null>(null);
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [propFilter, setPropFilter] = useState<PropertyFilterState>(EMPTY_PROPERTY_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      norm = Math.min(1, Math.max(0, (rect.right - e.clientX - thumbW / 2) / Math.max(1, trackW - thumbW)));
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
    const cached = boardCache.get();
    if (cached) { setCards(cached); setLoading(false); }
    else setLoading(true);
    const all: PublicCard[] = [];
    for (let offset = 0; ; offset += 60) {
      const params = new URLSearchParams({ limit: '60', offset: String(offset) });
      let result = await supabase.functions.invoke(`public-listings-board?${params.toString()}`, { method: 'GET' });
      if (result.error) { await new Promise(r => setTimeout(r, 800)); result = await supabase.functions.invoke(`public-listings-board?${params.toString()}`, { method: 'GET' }); }
      const { data, error } = result;
      // Background refresh failures keep the listings already shown, silently.
      if (error) { if (!cached && !all.length) toast.error('לא ניתן לטעון את לוח הנכסים'); break; }
      const rows = (data?.properties ?? []) as PublicCard[];
      all.push(...rows);
      if (data?.has_more !== true) break;
    }
    const fresh = [...new Map(all.map(card => [card.id, card])).values()];
    if (all.length || !cached) { setCards(fresh); boardCache.set(fresh); }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

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

  const [showWelcome, setShowWelcome] = useState(() => shouldShowWelcome('home'));
  const [welcomeKey, setWelcomeKey] = useState(0);
  useEffect(() => {
    setShowWelcome(shouldShowWelcome('home'));
    setWelcomeKey((key) => key + 1);
  }, [location.key]);
  useEffect(() => {
    const reopen = () => { if (!shouldShowWelcome('logo')) return; setWelcomeKey((key) => key + 1); setShowWelcome(true); };
    window.addEventListener(WELCOME_REOPEN_EVENT, reopen);
    return () => window.removeEventListener(WELCOME_REOPEN_EVENT, reopen);
  }, []);
  const filtered = useMemo(() => cards.filter((card) => {
    if (deal !== 'all' && card.deal_type !== deal) return false;
    if (query.trim() && ![card.title, card.street, card.city, card.neighborhood].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))) return false;
    const row = marketplace.data?.find(item => item.listing_id === card.id);
    return matchesPropertyFilter(card as unknown as Record<string, unknown>, propFilter) && matchesLeadFilter(leadTierAmounts(row as unknown as Record<string, unknown>), leadFilter);
  }), [cards, propFilter, query, deal, marketplace.data, leadFilter]);
  const partnerActions = (card: PublicCard) => {
    if (!user || !isAffiliate || !consent.data || !card.affiliate_enabled) return null;
    const listing = marketplace.data?.find(row => row.listing_id === card.id);
    return listing ? <div onClick={event => event.stopPropagation()}><PartnerListingActions boardRow listing={listing} referralId={referrals.data?.find(row => row.listing_id === card.id)?.id} /></div> : null;
  };
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
  const columns = usePublicBoardColumns(`${user?.id || 'guest'}:${activeWorkspaceId || 'public'}`, ordered);
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
  useEffect(() => { setVisibleCount(24); }, [query, deal, propFilter, leadFilter, grid]);
  // Guest reward indicators disclose configured types, never prices.
  const visibleColumns = columns.visible;
  const cities = useMemo(() => [...new Set(cards.map((c) => c.city).filter(Boolean) as string[])].sort(), [cards]);
  const neighborhoods = useMemo(() => [...new Set(cards.map((c) => c.neighborhood).filter(Boolean) as string[])].sort(), [cards]);

  return (
    <div dir="rtl" className={cn('flex min-h-0 flex-col overflow-hidden bg-background', embedded ? 'h-full' : 'public-board-page h-[100dvh]')}>
      {showWelcome && (
        <div className={cn('fixed inset-x-0 bottom-0 z-40 overflow-hidden overscroll-none bg-background', embedded ? 'top-16' : 'top-14 sm:top-16')}>
          <div className={cn('mx-auto w-full max-w-6xl px-1 sm:px-4', embedded && 'app-content-width')}>
            <WelcomeSlides key={welcomeKey} onDone={() => setShowWelcome(false)} />
          </div>
        </div>
      )}
      <header className="relative z-20 shrink-0 bg-card">
        <div className="mx-auto w-full max-w-6xl px-1 sm:px-4 pb-0 pt-2">
          {embedded ? null : (
            <div className="relative z-50 grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-x-2 bg-card sm:gap-x-3">
              <h1 className="sr-only">לוח שיווק שותפים</h1>
              <div className="flex items-center justify-start">
                {!user && <Button size="icon" variant="ghost" onClick={goToAuth} aria-label="הרשמה או התחברות" title="הרשמה או התחברות" className="h-[46.8px] w-[46.8px] cursor-pointer border-0 bg-transparent p-0 shadow-none hover:bg-transparent"><CircleUserRound className="!h-[26px] !w-[26px]" strokeWidth={1} /></Button>}
              </div>
              <Button variant="ghost" className="h-auto shrink-0 justify-self-center p-0 hover:bg-transparent" aria-label="TORAFF - דף הבית" onClick={() => { if (!shouldShowWelcome('logo')) return; setWelcomeKey((key) => key + 1); setShowWelcome(true); }}><PlatformBrand className="h-[52px] shrink-0 sm:h-[65px]" /></Button>
              <div className="flex items-center justify-end">
                <PublicListingPublisher autoResume />
              </div>
            </div>
          )}
          <div className={embedded ? '' : 'mt-3'}><BoardSearchControls query={query} onQueryChange={setQuery} onSearch={() => void load()} deals={deals} onDealToggle={toggleDeal} grid={grid} onViewToggle={toggleGrid} filter={<LeadTypeFilterButton state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} />} /></div>
        </div>
      </header>

      <main aria-label="רשימת נכסים" className={cn('mx-auto min-h-0 w-full min-w-0 max-w-6xl flex-1 overscroll-contain px-1 pb-0 sm:px-4 pt-[19px]', grid || loading || filtered.length === 0 ? 'overflow-y-auto' : 'flex flex-col overflow-hidden')}>
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">טוען נכסים…</p> : filtered.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו נכסים מתאימים</p> : (
          grid ? (
          <div className={cn(grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : '')}>
            {filtered.slice(0, visibleCount).map(card => <StandardPropertyCard key={card.id} card={card} signedIn={!!user} isMine={ownedIds.has(card.id)} isFav={favIds.has(card.id)} onFavorite={() => void toggleFavorite(card)} actions={partnerActions(card)} />)}
          </div>
          ) : (
            <BoardColumnDragArea controls={columns}>
            <HorizontalTableScroll ref={tableWrapRef} aria-label="טבלת נכסים" className="board-head-sticky flex-1 rounded-lg border bg-card">
              <table data-column-managed="true" className="w-max min-w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {visibleColumns.map(id => <BoardColumnHeader key={id} id={id} controls={columns} />)}
                    <th className="px-2 pt-2 text-start font-medium">מפרסם</th>
                    <th className="w-10 px-2 pb-0 pt-2"><BoardColumnMenu controls={columns} /></th>
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
                      // Scroll the expanded card's top to the top of the view.
                      // A short delay lets the expansion animation start first,
                      // otherwise the smooth scroll is cancelled by the reflow.
                      // The pinned header row covers the top of the scroller, so the row
                      // needs its own scroll margin to land fully below it.
                      const head = tableWrapRef.current?.querySelector('thead') as HTMLElement | null;
                      const row = document.getElementById(`row-${card.id}`);
                      if (row) row.style.scrollMarginTop = `${(head?.offsetHeight ?? 0) + 6}px`;
                      window.setTimeout(() => row?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
                    };
                    return [
                      <tr key={card.id} id={`row-${card.id}`} data-row-id={card.id} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className="cursor-pointer border-t text-xs hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {visibleColumns.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'address' && 'text-foreground', id === 'price' && 'whitespace-nowrap', id === 'price' && (card.deal_type === 'rent' ? 'text-sale' : 'text-success'), id === 'floor' && 'whitespace-nowrap', (id === 'rooms' || id === 'sqm' || id === 'floor') && 'text-[16px]')}>
                          {id === 'photo' ? (
                          <div className="relative w-12">
                            {card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" /> : <div className="h-12 w-12 rounded bg-muted" />}
                            {(card.photos?.length ?? 0) > 1 && <span aria-label={`${card.photos!.length} תמונות`} className="absolute right-0.5 top-0.5 rounded bg-foreground/70 px-1 text-[9px] font-semibold leading-tight text-background">{card.photos!.length}</span>}
                            {ownedIds.has(card.id) && <span title="המודעה שלי" aria-label="המודעה שלי" className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-br rounded-tl bg-white/80 text-success"><BadgeCheck className="h-3 w-3" aria-hidden="true" /></span>}
                          </div>
                          ) : id === 'address' ? <div className="w-44 min-w-0 max-w-[11rem] sm:w-72 sm:max-w-[18rem]"><PublicCardSummary card={card} showCommissions={false} showBroker={false} dense /></div>
                          : id === 'price' ? <span className="text-[17px] font-bold">{shekel(card.price)}{card.deal_type === 'rent' && card.price ? <span className="ms-1 text-xs font-normal"> / לחודש</span> : null}</span>
                          : id === 'commissions' ? <PropertyCommissionIcons table listingId={card.id} raw={{ reward_types: card.reward_types, closing_level: card.closing_level, reward_levels: (card as { reward_levels?: unknown }).reward_levels }} />
                          : id === 'rooms' ? card.rooms || ''
                          : id === 'sqm' ? card.sqm || ''
                          : card.floor != null ? `${card.floor}${card.total_floors ? `/${card.total_floors}` : ''}` : ''}
                        </td>)}
                        <td className="p-2"><div className="w-48 max-w-[12rem]"><PublicCardPublisher card={card} /></div></td>
                        <td className="p-2 align-bottom"><div className="flex items-center gap-1">{partnerActions(card)}
                          <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); void toggleFavorite(card); }} aria-label={favIds.has(card.id) ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" aria-pressed={favIds.has(card.id)} className="h-8 w-8 text-destructive"><Heart className={cn('h-4 w-4', favIds.has(card.id) && 'fill-current')} /></Button>
                          <Button type="button" size="icon" variant="ghost" aria-label="גרירה לשינוי סדר" title="גרירה לשינוי סדר" className="h-8 w-8 cursor-grab touch-none text-muted-foreground active:cursor-grabbing" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.stopPropagation(); rowDrag.current = { id: card.id, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={moveRowDrag} onPointerUp={finishRowDrag} onPointerCancel={() => { rowDrag.current = null; setDragGhost(null); }}><GripVertical className="h-4 w-4" /></Button>
                        </div>
                         </td>
                      </tr>,
                      <tr key={`${card.id}-x`} className="bg-muted/10">
                        <td colSpan={visibleColumns.length + 2} className="p-0">
                          <AnimatedExpansion open={open}>
                          <div id={`details-${card.id}`} className="sticky right-0 min-w-0 space-y-4 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                            <div className="min-w-0 space-y-3">
                              {open && <ExpandedPropertyDetails gallery={<PropertyGallerySlider photos={card.photos} alt={title} />} idOrSlug={card.slug || card.id} isFav={favIds.has(card.id)} onFavorite={() => toggleFavorite(card)} />}
                              <PropertyContactActions listingId={card.id} title={title} dealType={card.deal_type} premsg={ritaPropertyPremsg(card)} options={card.contact_options} compact formAsButton showShare={false} />
                            </div>
                          </div>
                          </AnimatedExpansion>
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
<div className="sticky bottom-0 start-0 z-[5] bg-card px-3 py-1.5" style={wrapWidth ? { width: wrapWidth } : undefined}>
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
                    
              {filtered.length > visibleCount && <AutoLoadSentinel key={visibleCount} onReach={() => setVisibleCount(count => count + 10)} />}
            </HorizontalTableScroll>
            </BoardColumnDragArea>
          )
        )}
        {!loading && grid && filtered.length > visibleCount && <AutoLoadSentinel key={visibleCount} onReach={() => setVisibleCount(count => count + 10)} />}
      </main>

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
