import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, BadgeCheck, Heart, Home, LayoutGrid, List, Send } from 'lucide-react';
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
import type { LeadContactOptions } from '@/lib/leadTiers';

export type PublicCard = {
  id: string; slug: string | null; title: string | null; city: string | null; neighborhood: string | null;
  street: string; house_number?: string | null; apartment_number?: string | null; deal_type: string | null; rooms: number | null; sqm: number | null; floor: number | null; total_floors: number | null;
  price: number | null; description: string | null; photos: string[];
  contact_options: LeadContactOptions | null;
};

type GateIntent = 'favorite' | 'details';
const shekel = (n: number | null) => typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';
const dealLabel = (t: string | null) => t === 'rent' ? 'להשכרה' : 'למכירה';
function cleanTitle(card: PublicCard) {
  const location = [card.street || null, card.neighborhood, card.city].filter(Boolean);
  const rawParts = String(card.title ?? '').split(/[·|,]/).map((part) => part.trim()).filter(Boolean);
  const unique = Array.from(new Set([...rawParts, ...location].map((part) => String(part).trim()).filter(Boolean)));
  return unique.slice(0, 3).join(' · ') || 'נכס';
}

function PhotoCarousel({ photos, alt, onFavorite, isMine = false }: { photos: string[]; alt: string; onFavorite: () => void; isMine?: boolean }) {
  const [index, setIndex] = useState(0);
  if (!photos.length) return <div className="flex h-48 items-center justify-center bg-muted text-sm text-muted-foreground">אין תמונות</div>;
  const move = (delta: number) => setIndex((current) => (current + delta + photos.length) % photos.length);
  return (
    <div className="group relative h-48 overflow-hidden bg-muted">
      <img src={photos[index]} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      <Button type="button" size="icon" variant="ghost" onClick={(event) => { event.stopPropagation(); onFavorite(); }} aria-label="שמירה במועדפים" className="absolute left-2 top-2 h-9 w-9 bg-transparent text-destructive shadow-none hover:bg-background/30"><Heart className="h-5 w-5" /></Button>
      {(isMine || photos.length > 1) && (
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          {isMine && (
            <span title="המודעה שלי" className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-bold text-primary shadow">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              שלי
            </span>
          )}
          {photos.length > 1 && <span className="rounded-full bg-background/90 px-2 py-1 text-xs font-bold tabular-nums text-foreground shadow">({index + 1}/{photos.length})</span>}
        </div>
      )}
      {photos.length > 1 && <>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה קודמת" onClick={(event) => { event.stopPropagation(); move(-1); }} className="absolute start-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronRight className="h-5 w-5" /></Button>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה הבאה" onClick={(event) => { event.stopPropagation(); move(1); }} className="absolute end-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronLeft className="h-5 w-5" /></Button>
      </>}
    </div>
  );
}

export default function PublicListingsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const goToAuth = () =>
    navigate('/auth', { state: { returnTo: location.pathname + location.search } });
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState({ sale: true, rent: true });
  const deal: 'all' | 'sale' | 'rent' = deals.sale && deals.rent ? 'all' : deals.sale ? 'sale' : 'rent';
  const toggleDeal = (key: 'sale' | 'rent') => setDeals((cur) => { const next = { ...cur, [key]: !cur[key] }; return next.sale || next.rent ? next : cur; });
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setWrapWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const [grid, setGrid] = useState(false);
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
  const cities = useMemo(() => [...new Set(cards.map((c) => c.city).filter(Boolean) as string[])].sort(), [cards]);
  const neighborhoods = useMemo(() => [...new Set(cards.map((c) => c.neighborhood).filter(Boolean) as string[])].sort(), [cards]);

  return (
    <div dir="rtl" className={embedded ? "bg-background" : "min-h-screen bg-background"}>
      <header className="bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5">
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
              {([['sale', 'למכירה'], ['rent', 'להשכרה']] as const).map(([value, label]) => <Button key={value} size="sm" variant="ghost" aria-pressed={deals[value]} onClick={() => toggleDeal(value)} className={cn('gap-1.5 px-2', deals[value] ? 'font-semibold text-foreground' : 'text-muted-foreground/60')}><span className={cn('h-2 w-2 rounded-full', deals[value] ? (value === 'sale' ? 'bg-success' : 'bg-sale') : 'bg-muted-foreground/30')} />{label}</Button>)}
            </div>
            {query.trim() ? <Button type="button" className="shrink-0" onClick={() => void load()}>חיפוש</Button> : null}
            <Button className="ms-auto shrink-0" size="icon" variant="outline" onClick={() => setGrid((value) => !value)} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
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
              return <article key={card.id} role="link" tabIndex={0} aria-label={`פתיחת ${title}`} onClick={() => navigate(propertyPath)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(propertyPath); } }} className={cn('cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !grid && 'grid grid-cols-[120px_1fr] sm:grid-cols-[240px_1fr]')}>
                <PhotoCarousel photos={card.photos} alt={title} onFavorite={() => openGate(card, 'favorite')} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground">
                        <Home className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 break-words">{[card.street, card.neighborhood, card.city].filter(Boolean).join(', ')}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{[card.rooms ? `${card.rooms} חדרים` : null, card.sqm ? `${card.sqm} מ״ר` : null, card.floor != null ? `קומה ${card.floor}${card.total_floors ? ` מתוך ${card.total_floors}` : ''}` : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-bold', card.deal_type === 'rent' ? 'bg-sale text-sale-foreground shadow-sm' : 'bg-success text-success-foreground')}>{dealLabel(card.deal_type)}</span>
                      <p className="mt-1 text-sm font-bold text-foreground">{shekel(card.price)}</p>
                    </div>
                  </div>
                  {card.description && <p className="line-clamp-3 text-xs text-muted-foreground">{card.description}</p>}
                   <div className="pt-1">
                     <PropertyContactActions
                       listingId={card.id}
                       title={title}
                       premsg={ritaPropertyPremsg(card)}
                       options={card.contact_options}
                       compact
                        shareUrl={publicUrl(propertyPath)}
                        showShare
                     />
                   </div>
                </div>
              </article>;
            })}
          </div>
          ) : (
            <div ref={tableWrapRef} className="w-full min-w-0 max-w-[min(100%,calc(100vw-2rem))] overflow-x-auto overscroll-x-contain rounded-lg border bg-card [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]">
              <table className="w-max min-w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-14 p-2" />
                    <th className="p-2 text-right font-semibold">כתובת</th>
                    <th className="p-2 text-right font-semibold">עסקה</th>
                    <th className="p-2 text-right font-semibold">מחיר</th>
                    <th className="p-2 text-right font-semibold">חדרים</th>
                    <th className="p-2 text-right font-semibold">מ״ר</th>
                    <th className="p-2 text-right font-semibold">קומה</th>
                    <th className="w-10 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((card) => {
                    const title = cleanTitle(card);
                    const propertyPath = `/p/${encodeURIComponent(card.slug || card.id)}`;
                    const open = expandedId === card.id;
                    const toggle = () => setExpandedId(open ? null : card.id);
                    return [
                      <tr key={card.id} tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }} className="cursor-pointer border-t hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <td className="p-2">{card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" /> : <div className="h-10 w-10 rounded bg-muted" />}</td>
                        <td className="p-2 font-semibold text-foreground"><span className="block max-w-[9rem] truncate sm:max-w-[14rem]" title={[card.street, card.neighborhood, card.city].filter(Boolean).join(', ')}>{[card.street, card.neighborhood, card.city].filter(Boolean).join(', ')}</span></td>
                        <td className="p-2"><span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', card.deal_type === 'rent' ? 'bg-sale text-sale-foreground' : 'bg-success text-success-foreground')}>{dealLabel(card.deal_type)}</span></td>
                        <td className="p-2 whitespace-nowrap font-bold">{shekel(card.price)}</td>
                        <td className="p-2">{card.rooms || ''}</td>
                        <td className="p-2">{card.sqm || ''}</td>
                        <td className="p-2 whitespace-nowrap">{card.floor != null ? `${card.floor}${card.total_floors ? `/${card.total_floors}` : ''}` : ''}</td>
                        <td className="p-2"><ChevronDown className={cn('h-5 w-5 transition-transform', open && 'rotate-180')} /></td>
                      </tr>,
                      <tr key={`${card.id}-x`} className="bg-muted/10">
                        <td colSpan={8} className="p-0">
                          <AnimatedExpansion open={open}>
                          <div ref={open ? ownerSectionRef : undefined} className="sticky right-0 min-w-0 space-y-4 p-3 lg:p-5" style={wrapWidth ? { width: wrapWidth } : undefined}>
                            <div className="min-w-0">
                              {open && user ? (
                                <div ref={open ? ownerBarRef : undefined} className="mb-3">
                                  <OwnerListingActions listingId={card.id} />
                                </div>
                              ) : null}
                              {open && <PropertyGallerySlider photos={card.photos} alt={title} onFavorite={() => openGate(card, 'favorite')} />}
                            </div>
                            <div className="min-w-0 space-y-3">
                              <ExpandedPropertyDetails idOrSlug={card.slug || card.id} />
                              <PropertyContactActions listingId={card.id} title={title} premsg={ritaPropertyPremsg(card)} options={card.contact_options} compact shareUrl={publicUrl(propertyPath)} showShare />
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
