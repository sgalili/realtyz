import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Home, LayoutGrid, List, Search, Send } from 'lucide-react';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import PublicListingPublisher from '@/components/public/PublicListingPublisher';

export type PublicCard = {
  id: string; slug: string | null; title: string | null; city: string | null; neighborhood: string | null;
  street: string; deal_type: string | null; rooms: number | null; sqm: number | null; floor: number | null; total_floors: number | null;
  price: number | null; description: string | null; photos: string[];
};

type GateIntent = 'favorite' | 'details';
const shekel = (n: number | null) => typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';
const dealLabel = (t: string | null) => t === 'rent' ? 'להשכרה' : 'למכירה';
const stripAddressNumbers = (value: string) => value
  .replace(/(?:,|\s)+(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)\s*\d{1,4}[א-תA-Za-z]?/gi, '')
  .replace(/\s+\d{1,4}[א-תA-Za-z]?(?=\s*(?:,|$))/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function cleanTitle(card: PublicCard) {
  const location = [card.street ? stripAddressNumbers(card.street) : null, card.neighborhood, card.city].filter(Boolean);
  const rawParts = String(card.title ?? '').split(/[·|,]/).map((part) => stripAddressNumbers(part.trim())).filter(Boolean);
  const unique = Array.from(new Set([...rawParts, ...location].map((part) => String(part).trim()).filter(Boolean)));
  return unique.slice(0, 3).join(' · ') || 'נכס';
}

function PhotoCarousel({ photos, alt, onFavorite }: { photos: string[]; alt: string; onFavorite: () => void }) {
  const [index, setIndex] = useState(0);
  if (!photos.length) return <div className="flex h-48 items-center justify-center bg-muted text-sm text-muted-foreground">אין תמונות</div>;
  const move = (delta: number) => setIndex((current) => (current + delta + photos.length) % photos.length);
  return (
    <div className="group relative h-48 overflow-hidden bg-muted">
      <img src={photos[index]} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      <Button type="button" size="icon" variant="ghost" onClick={onFavorite} aria-label="שמירה במועדפים" className="absolute left-2 top-2 h-9 w-9 bg-transparent text-destructive shadow-none hover:bg-background/30"><Heart className="h-5 w-5" /></Button>
      {photos.length > 1 && <>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה קודמת" onClick={() => move(-1)} className="absolute start-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronRight className="h-5 w-5" /></Button>
        <Button type="button" size="icon" variant="secondary" aria-label="תמונה הבאה" onClick={() => move(1)} className="absolute end-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full shadow"><ChevronLeft className="h-5 w-5" /></Button>
        <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs font-bold tabular-nums text-foreground shadow">({index + 1}/{photos.length})</span>
      </>}
    </div>
  );
}

export default function PublicListingsBoard() {
  const { user } = useAuth();
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deal, setDeal] = useState<'all' | 'sale' | 'rent'>('all');
  const [grid, setGrid] = useState(true);
  const [gate, setGate] = useState<{ card: PublicCard; intent: GateIntent } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: 'rita' | 'visitor'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unlocked, setUnlocked] = useState<any | null>(null);

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

  const filtered = useMemo(() => cards, [cards]);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="relative flex min-h-11 items-center justify-between gap-3">
            <PublicListingPublisher autoResume />
            <h1 className="pointer-events-none absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 text-center text-xl font-bold text-foreground sm:w-auto sm:text-2xl">לוח נדל״ן שיתופי</h1>
            <img src={realtyzLogo} alt="Realtyz" className="h-10 w-auto shrink-0 object-contain sm:h-[42px]" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="relative min-w-[200px] max-w-md">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} placeholder="חיפוש לפי עיר או שכונה" className="pe-10 ps-3" />
              <Button type="button" size="icon" variant="ghost" onClick={() => void load()} aria-label="חיפוש" className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <div className="relative min-w-[200px] max-w-md flex-1">
                <div className="inline-flex rounded-md border bg-background p-1">
                {([['all', 'הכול'], ['sale', 'למכירה'], ['rent', 'להשכרה']] as const).map(([value, label]) => <Button key={value} size="sm" variant={deal === value ? 'default' : 'ghost'} onClick={() => setDeal(value)}>{label}</Button>)}
                </div>
              </div>
              <Button className="shrink-0" size="icon" variant="outline" onClick={() => setGrid((value) => !value)} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? <p className="py-16 text-center text-sm text-muted-foreground">טוען נכסים…</p> : filtered.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו נכסים מתאימים</p> : (
          <div className={cn(grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3')}>
            {filtered.map((card) => {
              const title = cleanTitle(card);
              return <article key={card.id} className={cn('overflow-hidden rounded-lg border bg-card shadow-sm', !grid && 'grid grid-cols-[120px_1fr] sm:grid-cols-[240px_1fr]')}>
                <PhotoCarousel photos={card.photos} alt={title} onFavorite={() => openGate(card, 'favorite')} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground">
                        <Home className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 break-words">{[card.street && stripAddressNumbers(card.street), card.neighborhood, card.city].filter(Boolean).join(', ')}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{[card.rooms ? `${card.rooms} חדרים` : null, card.sqm ? `${card.sqm} מ״ר` : null, card.floor != null ? `קומה ${card.floor}${card.total_floors ? ` מתוך ${card.total_floors}` : ''}` : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-bold', card.deal_type === 'rent' ? 'bg-success/15 text-success' : 'bg-orange-500 text-white shadow-sm')}>{dealLabel(card.deal_type)}</span>
                      <p className="mt-1 text-sm font-bold text-foreground">{shekel(card.price)}</p>
                    </div>
                  </div>
                  {card.description && <p className="line-clamp-3 text-xs text-muted-foreground">{card.description}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1" onClick={() => openGate(card, 'details')}>השארת פרטים</Button>
                  </div>
                </div>
              </article>;
            })}
          </div>
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
            {unlocked?.property && <div className="space-y-1 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground"><p className="font-bold">הפרטים המלאים נפתחו</p><p>כתובת: {[unlocked.property.address, unlocked.property.house_number].filter(Boolean).join(' ')}</p>{unlocked.property.apartment_number && <p>דירה: {unlocked.property.apartment_number}</p>}<a className="inline-flex rounded-md bg-success px-3 py-2 font-semibold text-success-foreground" href={unlocked.contact?.whatsapp_url} target="_blank" rel="noreferrer">פתיחת ווטסאפ</a></div>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
