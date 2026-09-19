import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Lock, MapPin, Navigation, Phone, Search, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

/** Masked card shape — the only property data an anonymous visitor receives. */
type PublicCard = {
  id: string;
  slug: string | null;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  street: string;
  deal_type: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  price: number | null;
  description: string | null;
  photos: string[];
};

type GateIntent = 'favorite' | 'details' | 'navigation' | 'contact';

const INTENT_TITLES: Record<GateIntent, string> = {
  favorite: 'שמירת הנכס במועדפים',
  details: 'צפייה בפרטים המלאים',
  navigation: 'ניווט לכתובת המדויקת',
  contact: 'יצירת קשר לגבי הנכס',
};

const CALLBACK_WINDOWS = ['בוקר (08:00-12:00)', 'צהריים (12:00-16:00)', 'אחר הצהריים (16:00-19:00)', 'ערב (19:00-21:00)'];

const shekel = (n: number | null) =>
  typeof n === 'number' && n > 0 ? `₪${n.toLocaleString('he-IL')}` : 'מחיר לא צוין';

const dealLabel = (t: string | null) => (t === 'rent' ? 'להשכרה' : t === 'sale' ? 'למכירה' : '');

function PhotoCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  if (!photos.length) {
    return <div className="flex h-44 items-center justify-center rounded-t-xl bg-muted text-xs text-muted-foreground">אין תמונות</div>;
  }
  const move = (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length);
  return (
    <div className="relative h-44 overflow-hidden rounded-t-xl bg-muted">
      <img src={photos[index]} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="תמונה קודמת"
            onClick={() => move(-1)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-1 text-foreground shadow"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="תמונה הבאה"
            onClick={() => move(1)}
            className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-1 text-foreground shadow"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="absolute bottom-2 start-1/2 -translate-x-1/2 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-semibold">
            {index + 1}/{photos.length}
          </span>
        </>
      )}
    </div>
  );
}

export default function PublicListingsBoard() {
  const [cards, setCards] = useState<PublicCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deal, setDeal] = useState<'all' | 'sale' | 'rent'>('all');

  // Lead-wall state
  const [gate, setGate] = useState<{ card: PublicCard; intent: GateIntent } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', callback: CALLBACK_WINDOWS[0] });
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
    const { data, error } = await supabase.functions.invoke(`public-listings-board?${params.toString()}`, {
      method: 'GET',
    });
    if (error) {
      toast.error('לא ניתן לטעון את לוח הנכסים');
      setLoading(false);
      return;
    }
    setCards(((data as any)?.properties ?? []) as PublicCard[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal]);

  const openGate = (card: PublicCard, intent: GateIntent) => {
    setGate({ card, intent });
    setToken(null);
    setUnlocked(null);
    setChat([]);
  };

  const submitGate = async () => {
    if (!gate) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 9) {
      toast.error('נא למלא שם וטלפון תקין');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-lead-gate', {
      body: {
        action: 'register',
        listing_id: gate.card.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        callback_window: form.callback,
        intent: gate.intent,
      },
    });
    setSending(false);
    const payload = data as any;
    if (error || !payload?.token) {
      toast.error(payload?.error || 'השליחה נכשלה, נסו שוב');
      return;
    }
    setToken(payload.token);
    setChat([{ role: 'rita', text: payload.greeting }]);
  };

  const sendToRita = async () => {
    const text = chatInput.trim();
    if (!text || !token) return;
    setChatInput('');
    setChat((c) => [...c, { role: 'visitor', text }]);
    const { data } = await supabase.functions.invoke('public-lead-gate', {
      body: { action: 'rita', token, message: text },
    });
    const payload = data as any;
    if (payload?.reply) setChat((c) => [...c, { role: 'rita', text: String(payload.reply) }]);
    if (payload?.unlocked) {
      const res = await supabase.functions.invoke('public-lead-gate', { body: { action: 'details', token } });
      const details = res.data as any;
      if (details?.property) setUnlocked(details);
    }
  };

  const filtered = useMemo(() => cards, [cards]);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <h1 className="text-2xl font-bold text-foreground">נכסים להשכרה ולמכירה</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            לוח הנכסים הפתוח. הפרטים המלאים והכתובת המדויקת נפתחים לאחר השארת פרטים ושיחה קצרה עם ריטה.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
                placeholder="חיפוש לפי עיר או שכונה"
                className="pe-10"
              />
            </div>
            <Select value={deal} onValueChange={(v) => setDeal(v as typeof deal)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="sale">למכירה</SelectItem>
                <SelectItem value="rent">להשכרה</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void load()}>חיפוש</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">טוען נכסים…</p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו נכסים מתאימים</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => (
              <article key={card.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <PhotoCarousel photos={card.photos} alt={card.title ?? 'נכס'} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-bold leading-snug text-foreground">
                      {card.title || `${card.city ?? ''} ${card.neighborhood ?? ''}`.trim() || 'נכס'}
                    </h2>
                    {card.deal_type && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {dealLabel(card.deal_type)}
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {[card.city, card.neighborhood, card.street].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{shekel(card.price)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[card.rooms ? `${card.rooms} חדרים` : null, card.sqm ? `${card.sqm} מ״ר` : null, card.floor != null ? `קומה ${card.floor}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {card.description && <p className="line-clamp-3 text-xs text-muted-foreground">{card.description}</p>}
                  <p className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> מספר הבית ופרטי הקשר נפתחים לאחר הרשמה
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openGate(card, 'favorite')} aria-label="מועדפים">
                      <Heart className="h-4 w-4 text-rose-600" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openGate(card, 'navigation')} aria-label="ניווט">
                      <Navigation className="h-4 w-4 text-sky-600" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openGate(card, 'contact')} aria-label="יצירת קשר">
                      <Phone className="h-4 w-4 text-emerald-600" />
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => openGate(card, 'details')}>
                      פרטים מלאים
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!gate} onOpenChange={(open) => { if (!open) setGate(null); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right text-base">
              {gate ? INTENT_TITLES[gate.intent] : ''}
            </DialogTitle>
          </DialogHeader>

          {!token ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                השאירו פרטים ונחזור אליכם. לאחר שיחה קצרה עם ריטה תקבלו את הכתובת המדויקת ואת כל פרטי הנכס.
              </p>
              <Input placeholder="שם מלא" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="טלפון נייד" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Select value={form.callback} onValueChange={(v) => setForm({ ...form, callback: v })}>
                <SelectTrigger><SelectValue placeholder="שעת חזרה מועדפת" /></SelectTrigger>
                <SelectContent>
                  {CALLBACK_WINDOWS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full" disabled={sending} onClick={() => void submitGate()}>
                {sending ? 'שולח…' : 'שליחה וקבלת הפרטים'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                {chat.map((m, i) => (
                  <p
                    key={i}
                    className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-xs ${
                      m.role === 'rita' ? 'bg-card text-foreground' : 'ms-auto bg-primary text-primary-foreground'
                    }`}
                  >
                    {m.text}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void sendToRita(); }}
                  placeholder="כתבו לריטה מה חשוב לכם"
                />
                <Button onClick={() => void sendToRita()} aria-label="שליחה"><Send className="h-4 w-4" /></Button>
              </div>

              {unlocked?.property && (
                <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="font-bold">הפרטים המלאים נפתחו</p>
                  <p>כתובת: {[unlocked.property.address, unlocked.property.house_number].filter(Boolean).join(' ')}</p>
                  {unlocked.property.apartment_number && <p>דירה: {unlocked.property.apartment_number}</p>}
                  {unlocked.contact?.broker_name && <p>איש קשר: {unlocked.contact.broker_name}</p>}
                  {unlocked.contact?.office_name && <p>משרד: {unlocked.contact.office_name}</p>}
                  <div className="flex gap-2 pt-1">
                    <a
                      className="rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white"
                      href={unlocked.contact?.whatsapp_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      וואטסאפ
                    </a>
                    {unlocked.property.latitude && unlocked.property.longitude && (
                      <a
                        className="rounded-md border border-emerald-300 px-3 py-1.5 font-semibold"
                        href={`https://waze.com/ul?ll=${unlocked.property.latitude},${unlocked.property.longitude}&navigate=yes`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ניווט
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
