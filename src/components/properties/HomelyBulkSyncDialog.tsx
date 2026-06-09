import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, MapPin, Phone, Mail, Home } from 'lucide-react';
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
  raw: unknown;
};

type HomelyContact = {
  homely_id: string;
  full_name: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  raw: unknown;
};

function normalizeIlPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

function slugify(s: string): string {
  return (s || 'homely')
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'homely';
}

export function HomelyBulkSyncDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const [tab, setTab] = useState<'properties' | 'contacts'>('properties');
  const [loadingProps, setLoadingProps] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [properties, setProperties] = useState<HomelyProperty[]>([]);
  const [contacts, setContacts] = useState<HomelyContact[]>([]);
  const [pickedProps, setPickedProps] = useState<Set<string>>(new Set());
  const [pickedContacts, setPickedContacts] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const fetchedOnce = useRef<{ properties: boolean; contacts: boolean }>({ properties: false, contacts: false });

  // Manual-only fetch. Auto-runs the first time the dialog is opened for each
  // tab, then stays silent — no intervals, no realtime, no re-fetch on focus.
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
      const { data, error } = await supabase.functions.invoke('homely-fetch-property', {
        body: { action },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string; properties?: HomelyProperty[]; contacts?: HomelyContact[]; count?: number };
      if (payload?.error) throw new Error(payload.error);
      if (isProps) {
        const list = payload.properties ?? [];
        setProperties(list);
        if (!list.length) toast.info('אין נכסים פעילים בחשבון הומלי המחובר');
        else toast.success(`נטענו ${list.length} נכסים מהומלי`);
      } else {
        const list = payload.contacts ?? [];
        setContacts(list);
        if (!list.length) toast.info('אין אנשי קשר פעילים בחשבון הומלי המחובר');
        else toast.success(`נטענו ${list.length} אנשי קשר מהומלי`);
      }
    } catch (e) {
      toast.error(`שגיאה בטעינה מהומלי: ${(e as Error).message}`);
    } finally {
      lastCallRef.ts = Date.now();
      isProps ? setLoadingProps(false) : setLoadingContacts(false);
    }
  }

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

  // Reset selection (but not cached lists) when the dialog closes.
  useEffect(() => {
    if (!open) {
      setPickedProps(new Set());
      setPickedContacts(new Set());
    }
  }, [open]);

  function toggle(set: Set<string>, id: string, apply: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    apply(next);
  }

  async function handleImport() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('יש להתחבר מחדש'); return; }
    setImporting(true);
    try {
      let propsCount = 0;
      let contactsCount = 0;

      if (pickedProps.size) {
        const rows = properties
          .filter((p) => pickedProps.has(p.homely_id))
          .map((p) => ({
            user_id: user.id,
            slug: `${slugify(p.title || p.address || 'homely')}-${p.homely_id}`,
            source: 'homely',
            external_id: p.homely_id,
            property_title: p.title || p.address || `נכס ${p.homely_id}`,
            description: p.description || '',
            asking_price: p.price || 0,
            city: p.city || null,
            address: p.address || null,
            rooms: p.rooms || null,
            sqm: p.sqm || null,
            floor: p.floor || null,
            status: 'live',
            features: [],
            source_metadata: {
              homely_id: p.homely_id,
              photos: p.photo ? [p.photo] : [],
              homely_raw: p.raw,
              synced_at: new Date().toISOString(),
            },
          }));
        const { error } = await supabase
          .from('listings')
          .upsert(rows, { onConflict: 'source,external_id' });
        if (error) throw error;
        propsCount = rows.length;
      }

      if (pickedContacts.size) {
        const rows = contacts
          .filter((c) => pickedContacts.has(c.homely_id))
          .map((c) => ({
            phone_number: normalizeIlPhone(c.phone) || c.phone || c.email || c.homely_id,
            full_name: c.full_name || null,
            city: c.city || null,
            email: c.email || null,
            preferences: { homely_id: c.homely_id, homely_notes: c.notes, source: 'homely' },
          }));
        // Upsert by phone_number — leads.phone_number is the natural key.
        const { error } = await supabase
          .from('leads')
          .upsert(rows, { onConflict: 'phone_number' });
        if (error) throw error;
        contactsCount = rows.length;
      }

      toast.success(`יובאו ${propsCount} נכסים ו-${contactsCount} אנשי קשר`);
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`שגיאה בייבוא: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  const totalPicked = pickedProps.size + pickedContacts.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader className="text-right">
          <DialogTitle>סנכרון מלא מהומלי</DialogTitle>
          <DialogDescription>
            בחרו אילו נכסים ואנשי קשר לייבא ולסנכרן עם המערכת. הסנכרון ידני בלבד.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'properties' | 'contacts')}>
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="properties">נכסים זמינים {properties.length ? `(${properties.length})` : ''}</TabsTrigger>
              <TabsTrigger value="contacts">אנשי קשר {contacts.length ? `(${contacts.length})` : ''}</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loadingProps || loadingContacts}
              onClick={() => fetchAction(tab === 'properties' ? 'fetchAllProperties' : 'fetchAllContacts')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${(loadingProps || loadingContacts) ? 'animate-spin' : ''}`} />
              רענון
            </Button>
          </div>

          <TabsContent value="properties" className="mt-3">
            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {loadingProps ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
              ) : properties.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  אין נכסים פעילים בחשבון הומלי המחובר
                </div>
              ) : (
                properties.map((p) => {
                  const checked = pickedProps.has(p.homely_id);
                  return (
                    <label
                      key={p.homely_id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(pickedProps, p.homely_id, setPickedProps)} />
                      <div className="h-14 w-20 rounded-md bg-muted overflow-hidden flex-shrink-0">
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                            <Home className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Badge variant="outline" className="text-[10px]">#{p.homely_id}</Badge>
                          <h4 className="font-semibold text-sm truncate">{p.title || p.address || 'ללא כותרת'}</h4>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 justify-end mt-1 flex-wrap">
                          {p.city && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}{p.address ? ` · ${p.address}` : ''}</span>)}
                          {p.rooms ? <span>{p.rooms} חד׳</span> : null}
                          {p.sqm ? <span>{p.sqm} מ״ר</span> : null}
                          {p.price ? <span className="font-semibold text-foreground">₪{p.price.toLocaleString('he-IL')}</span> : null}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {properties.length > 0 && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickedProps(new Set(properties.map((p) => p.homely_id)))}>בחר הכל</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickedProps(new Set())}>נקה בחירה</button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-3">
            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {loadingContacts ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
              ) : contacts.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-10">
                  אין אנשי קשר פעילים בחשבון הומלי המחובר
                </div>
              ) : (
                contacts.map((c) => {
                  const checked = pickedContacts.has(c.homely_id);
                  return (
                    <label
                      key={c.homely_id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(pickedContacts, c.homely_id, setPickedContacts)} />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Badge variant="outline" className="text-[10px]">#{c.homely_id}</Badge>
                          <h4 className="font-semibold text-sm truncate">{c.full_name || 'ללא שם'}</h4>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 justify-end mt-1 flex-wrap">
                          {c.phone && (<span className="inline-flex items-center gap-1" dir="ltr"><Phone className="h-3 w-3" />{c.phone}</span>)}
                          {c.email && (<span className="inline-flex items-center gap-1" dir="ltr"><Mail className="h-3 w-3" />{c.email}</span>)}
                          {c.city && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city}</span>)}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {contacts.length > 0 && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setPickedContacts(new Set(contacts.map((c) => c.homely_id)))}>בחר הכל</button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPickedContacts(new Set())}>נקה בחירה</button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleImport} disabled={importing || totalPicked === 0}>
            {importing ? 'מייבא...' : `ייבא וסנכרן ${totalPicked || ''} פריטים נבחרים`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
