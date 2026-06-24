import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { RefreshCw, MapPin, Phone, Mail, Home, SlidersHorizontal, Loader2, CheckCircle2, Building2, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// 60s client-side debounce shared across both fetch actions to protect Homely.
const lastCallRef = { ts: 0 };

type HomelyProperty = {
  homely_id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  address: string;
  rooms: number;
  sqm: number;
  floor: number;
  photo: string | null;
  photos?: string[];
  documents?: string[];
  property_type?: string;
  agent?: string;
  sivug?: string;
  raw: unknown;
};

type HomelyContact = {
  homely_id: string;
  full_name: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  agent?: string;
  sivug?: string;
  raw: unknown;
};


export function HomelyBulkSyncDialog({ open, onOpenChange, onImported, mode = 'properties' }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
  mode?: 'properties' | 'contacts';
}) {
  const [tab, setTab] = useState<'properties' | 'contacts'>(mode);
  useEffect(() => { setTab(mode); }, [mode, open]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [properties, setProperties] = useState<HomelyProperty[]>([]);
  const [contacts, setContacts] = useState<HomelyContact[]>([]);
  const [pickedProps, setPickedProps] = useState<Set<string>>(new Set());
  const [pickedContacts, setPickedContacts] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ properties: number; contacts: number } | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fCities, setFCities] = useState<Set<string>>(new Set());
  const [fRooms, setFRooms] = useState('');
  const [fType, setFType] = useState('');
  const [fAgent, setFAgent] = useState('');
  const [cityPopOpen, setCityPopOpen] = useState(false);
  const fetchedOnce = useRef<{ properties: boolean; contacts: boolean }>({ properties: false, contacts: false });


  async function fetchAction(action: 'fetchAllProperties' | 'fetchAllContacts') {
    const now = Date.now();
    if (now - lastCallRef.ts < 60_000) {
      const left = Math.ceil((60_000 - (now - lastCallRef.ts)) / 1000);
      toast.info(`רענון זמין שוב בעוד ${left} שניות`);
      return;
    }
    const isProps = action === 'fetchAllProperties';
    isProps ? setLoadingProps(true) : setLoadingContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke('homely-fetch-property', { body: { action } });
      if (error) throw error;
      const payload = data as any;
      if (payload?.needs_setup) {
        toast.message('יש לחבר תחילה את חשבון Homely', { description: 'עברו ל-הגדרות ← חיבורים והזינו קוד משרד, משתמש וסיסמה.' });
        return;
      }
      if (payload?.error && !payload?.empty) throw new Error(payload.error);
      if (isProps) {
        const list: HomelyProperty[] = payload.properties ?? [];
        setProperties(list);
        if (!list.length) toast.info(payload.message ?? 'התחברות הצליחה, לא נמצאו נכסים חדשים בחשבון הומלי המחובר.');
        else toast.success(`נטענו ${list.length} נכסים מהומלי`);
      } else {
        const list: HomelyContact[] = payload.contacts ?? [];
        setContacts(list);
        if (!list.length) toast.info(payload.message ?? 'אין אנשי קשר פעילים בחשבון הומלי המחובר');
        else toast.success(`נטענו ${list.length} אנשי קשר מהומלי`);
      }
    } catch (e) {
      toast.error(`שגיאה בטעינה מהומלי: ${(e as Error).message}`);
    } finally {
      lastCallRef.ts = Date.now();
      isProps ? setLoadingProps(false) : setLoadingContacts(false);
    }
  }

  // Auto-fetch ONLY once per tab when dialog opens. No intervals, no polling, no refocus refetch.
  useEffect(() => {
    if (!open) return;
    if (tab === 'properties' && !fetchedOnce.current.properties) {
      fetchedOnce.current.properties = true;
      fetchAction('fetchAllProperties');
    } else if (tab === 'contacts' && !fetchedOnce.current.contacts) {
      fetchedOnce.current.contacts = true;
      fetchAction('fetchAllContacts');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (!open) {
      setPickedProps(new Set());
      setPickedContacts(new Set());
      setFiltersOpen(false);
      setFCities(new Set()); setFRooms(''); setFType(''); setFAgent('');
    }
  }, [open]);

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  }

  const cityOptions = useMemo(() => {
    const src = tab === 'properties' ? properties.map(p => p.city) : contacts.map(c => c.city);
    return Array.from(new Set(src.filter(Boolean))).sort();
  }, [tab, properties, contacts]);
  const typeOptions = useMemo(() => Array.from(new Set(properties.map(p => p.property_type || '').filter(Boolean))).sort(), [properties]);
  const agentOptions = useMemo(() => {
    const src = tab === 'properties' ? properties.map(p => p.agent || '') : contacts.map(c => c.agent || '');
    return Array.from(new Set(src.filter(Boolean))).sort();
  }, [tab, properties, contacts]);

  const filteredProps = useMemo(() => properties.filter(p => {
    if (fCities.size && !fCities.has(p.city)) return false;
    if (fType && (p.property_type || '') !== fType) return false;
    if (fRooms && Number(p.rooms) !== Number(fRooms)) return false;
    if (fAgent && (p.agent || '') !== fAgent) return false;
    return true;
  }), [properties, fCities, fType, fRooms, fAgent]);
  const filteredContacts = useMemo(() => contacts.filter(c => {
    if (fCities.size && !fCities.has(c.city)) return false;
    if (fAgent && (c.agent || '') !== fAgent) return false;
    return true;
  }), [contacts, fCities, fAgent]);


  async function handleImport() {
    setImporting(true);
    try {
      const selectedPropertyIds = Array.from(pickedProps);
      const selectedContactIds = Array.from(pickedContacts);
      const { data, error } = await supabase.functions.invoke('homely-fetch-property', {
        body: { action: 'importOutJson', propertyIds: selectedPropertyIds, contactIds: selectedContactIds },
      });
      if (error) throw error;
      const payload = data as any;
      if (payload?.error) throw new Error(payload.error);
      const propsCount = Number(payload?.propsCount ?? selectedPropertyIds.length);
      const contactsCount = Number(payload?.contactsCount ?? selectedContactIds.length);
      setPickedProps(new Set());
      setPickedContacts(new Set());
      onImported?.();
      setSummary({ properties: propsCount, contacts: contactsCount });
    } catch (e) {
      toast.error(`שגיאה בייבוא: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  function closeAll() {
    setSummary(null);
    onOpenChange(false);
  }


  const totalPicked = pickedProps.size + pickedContacts.size;
  const loading = loadingProps || loadingContacts;

  return (
    <>
    <Dialog open={open && !summary} onOpenChange={(v) => { if (importing && !v) return; onOpenChange(v); }}>

      <DialogContent
        dir="rtl"
        className="max-w-3xl w-[calc(100vw-1rem)] max-h-[95vh] overflow-hidden p-4 sm:p-6 flex flex-col gap-3"
      >
        <DialogHeader className="text-right space-y-0">
          <DialogTitle className="text-right">{mode === 'contacts' ? 'סנכרון מתעניינים מהומלי' : 'סנכרון נכסים מהומלי'}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'properties' | 'contacts')} className="flex flex-col min-h-0 flex-1">
          <div dir="rtl" className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto flex-wrap">
              {mode === 'properties' && <TabsTrigger value="properties" className="text-xs sm:text-sm">נכסים {properties.length ? `(${filteredProps.length})` : ''}</TabsTrigger>}
              {mode === 'contacts' && <TabsTrigger value="contacts" className="text-xs sm:text-sm">אנשי קשר {contacts.length ? `(${filteredContacts.length})` : ''}</TabsTrigger>}
            </TabsList>

            <div className="flex items-center gap-1.5">
              <Button
                variant={filtersOpen ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setFiltersOpen(v => !v)}
                aria-label="סינון"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">סינון</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={loading}
                onClick={() => fetchAction(tab === 'properties' ? 'fetchAllProperties' : 'fetchAllContacts')}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">רענון</span>
              </Button>
            </div>
          </div>

          {filtersOpen && (
            <div dir="rtl" className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2 text-right">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">עיר</label>
                <select className="w-full h-8 rounded-md border bg-background px-2 text-xs text-right" value={fCity} onChange={(e) => setFCity(e.target.value)}>
                  <option value="">הכל</option>
                  {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">חדרים</label>
                <Input type="number" min={1} step={0.5} value={fRooms} onChange={(e) => setFRooms(e.target.value)} className="h-8 text-xs text-right" placeholder="הכל" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">סוג נכס</label>
                <select className="w-full h-8 rounded-md border bg-background px-2 text-xs text-right" value={fType} onChange={(e) => setFType(e.target.value)}>
                  <option value="">הכל</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          <TabsContent value="properties" className="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto space-y-2 pl-1">
              {loadingProps ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : filteredProps.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  {properties.length === 0 ? 'אין נכסים פעילים בחשבון הומלי המחובר' : 'אין תוצאות שתואמות לסינון'}
                </div>
              ) : (
                filteredProps.map((p) => {
                  const checked = pickedProps.has(p.homely_id);
                  const mediaCount = (p.photos?.length ?? (p.photo ? 1 : 0)) + (p.documents?.length ?? 0);
                  return (
                    <label
                      key={p.homely_id}
                      dir="rtl"
                      className={`flex items-start gap-2 sm:gap-3 rounded-lg border p-2 sm:p-3 cursor-pointer transition-colors text-right ${checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(pickedProps, p.homely_id, setPickedProps)} className="mt-1 shrink-0" />
                      <div className="h-12 w-16 sm:h-14 sm:w-20 rounded-md bg-muted overflow-hidden flex-shrink-0">
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            <Home className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div dir="rtl" className="flex-1 min-w-0 text-right">
                        <div dir="rtl" className="flex items-center gap-2 justify-start flex-wrap text-right">
                          <h4 className="font-semibold text-xs sm:text-sm truncate text-right">{p.title || p.address || 'ללא כותרת'}</h4>
                          <Badge variant="outline" className="text-[10px]">#{p.homely_id}</Badge>
                          {mediaCount > 0 && <Badge variant="secondary" className="text-[10px]">{mediaCount} קבצים</Badge>}
                        </div>
                        <div dir="rtl" className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-2 sm:gap-3 justify-start mt-1 flex-wrap break-words text-right">
                          {p.city && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}{p.address ? ` · ${p.address}` : ''}</span>)}
                          {p.rooms ? <span>{p.rooms} חד׳</span> : null}
                          {p.sqm ? <span>{p.sqm} מ״ר</span> : null}
                          {p.price ? <span dir="rtl" className="font-semibold text-foreground">₪{p.price.toLocaleString('he-IL')}</span> : null}
                        </div>
                      </div>

                    </label>
                  );
                })
              )}
            </div>
            {filteredProps.length > 0 && (
              <div dir="rtl" className="flex items-center justify-between mt-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickedProps(new Set(filteredProps.map((p) => p.homely_id)))}>בחר הכל</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickedProps(new Set())}>נקה בחירה</button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
            <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto space-y-2 pe-1">
              {loadingContacts ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
              ) : filteredContacts.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  {contacts.length === 0 ? 'אין אנשי קשר פעילים בחשבון הומלי המחובר' : 'אין תוצאות שתואמות לסינון'}
                </div>
              ) : (
                filteredContacts.map((c) => {
                  const checked = pickedContacts.has(c.homely_id);
                  return (
                    <label
                      key={c.homely_id}
                      dir="rtl"
                      className={`flex flex-row items-start gap-2 sm:gap-3 rounded-lg border p-2 sm:p-3 cursor-pointer transition-colors text-right ${checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(pickedContacts, c.homely_id, setPickedContacts)} className="mt-1 shrink-0" />
                      <div className="flex-1 min-w-0 text-right" dir="rtl">
                        <div dir="rtl" className="flex flex-row items-center gap-2 flex-wrap text-right">
                          <h4 className="font-semibold text-xs sm:text-sm truncate text-right">{c.full_name || 'ללא שם'}</h4>
                          <Badge variant="outline" className="text-[10px]">#{c.homely_id}</Badge>
                        </div>
                        <div dir="rtl" className="text-[11px] sm:text-xs text-muted-foreground flex flex-row items-center gap-2 sm:gap-3 mt-1 flex-wrap break-all text-right">
                          {c.city && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city}</span>)}
                          {c.phone && (<span className="inline-flex items-center gap-1" dir="ltr"><Phone className="h-3 w-3" />{c.phone}</span>)}
                          {c.email && (<span className="inline-flex items-center gap-1" dir="ltr"><Mail className="h-3 w-3" />{c.email}</span>)}
                        </div>
                      </div>

                    </label>
                  );
                })
              )}
            </div>
            {filteredContacts.length > 0 && (
              <div dir="rtl" className="flex items-center justify-between mt-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickedContacts(new Set(filteredContacts.map((c) => c.homely_id)))}>בחר הכל</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickedContacts(new Set())}>נקה בחירה</button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter dir="rtl" className="flex-row justify-between gap-2 sm:justify-between border-t pt-3 mt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>ביטול</Button>
          <Button onClick={handleImport} disabled={importing || totalPicked === 0} className="gap-2">
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            {importing ? 'מייבא...' : `ייבא וסנכרן${totalPicked ? ` ${totalPicked}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!summary} onOpenChange={(v) => { if (!v) closeAll(); }}>
      <DialogContent dir="rtl" className="max-w-md text-center p-6">
        <DialogHeader className="items-center text-center space-y-3">
          <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <DialogTitle className="text-xl text-center">הסנכרון הושלם בהצלחה!</DialogTitle>
        </DialogHeader>
        <div dir="rtl" className="mt-4 space-y-3 text-right">
          {mode === 'properties' ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Building2 className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 text-sm">נכסים שנקלטו במערכת</div>
              <div className="text-lg font-bold tabular-nums">{summary?.properties ?? 0}</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Users className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 text-sm">אנשי קשר שנקלטו במערכת</div>
              <div className="text-lg font-bold tabular-nums">{summary?.contacts ?? 0}</div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-6 sm:justify-center">
          <Button onClick={closeAll} className="w-full sm:w-auto px-8">מעולה, תודה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

