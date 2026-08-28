import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, StickyNote, BellRing, MessageSquarePlus, Home, Loader2, Search, ArrowLeft, CalendarCheck2 } from 'lucide-react';
import { invalidateLiveData } from '@/lib/liveSync';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type TabKey = 'note' | 'reminder' | 'interaction' | 'matches';

type LeadLite = { id: string; full_name: string | null; phone_number: string | null; city: string | null; deal_type: string | null };
type ListingLite = { id: string; property_title: string | null; city: string | null; neighborhood: string | null; rooms: number | null; asking_price: number | null; deal_type: string | null };

const TABS: Array<{ key: TabKey; label: string; icon: typeof StickyNote }> = [
  { key: 'note', label: 'פתק', icon: StickyNote },
  { key: 'reminder', label: 'תזכורת', icon: BellRing },
  { key: 'interaction', label: 'סיכום שיחה', icon: MessageSquarePlus },
  { key: 'matches', label: 'התאמת נכס', icon: Home },
];

const CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'whatsapp', label: 'וואטסאפ' },
  { value: 'phone', label: 'שיחת טלפון' },
  { value: 'email', label: 'אימייל' },
  { value: 'meeting', label: 'פגישה' },
  { value: 'facebook', label: 'פייסבוק' },
];

function localDefaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateTime(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QuickActionDrawer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('note');
  const [saving, setSaving] = useState(false);

  // lead picker
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [lead, setLead] = useState<LeadLite | null>(null);
  const [searching, setSearching] = useState(false);

  // property picker (notes can be attached to a listing)
  const [listingQuery, setListingQuery] = useState('');
  const [listingResults, setListingResults] = useState<ListingLite[]>([]);
  const [listing, setListing] = useState<ListingLite | null>(null);

  // forms
  const [noteText, setNoteText] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderWhen, setReminderWhen] = useState(localDefaultDue());
  const [reminderPriority, setReminderPriority] = useState('medium');
  const [interactionChannel, setInteractionChannel] = useState('whatsapp');
  const [interactionText, setInteractionText] = useState('');
  const [calendarSlots, setCalendarSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);

  // matches
  const [matches, setMatches] = useState<ListingLite[] | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);

  useEffect(() => {
    const openHandler = (e: Event) => {
      const requested = (e as CustomEvent<{ tab?: TabKey }>).detail?.tab;
      if (requested) setTab(requested);
      setOpen(true);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('open-quick-actions', openHandler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('open-quick-actions', openHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = leadQuery.trim();
    if (q.length < 2) { setLeadResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const digits = q.replace(/\D/g, '');
      const filters = [`full_name.ilike.%${q}%`];
      if (digits.length >= 3) filters.push(`phone_number.ilike.%${digits}%`);
      const { data } = await (supabase as any)
        .from('leads')
        .select('id, full_name, phone_number, city, deal_type')
        .or(filters.join(','))
        .limit(8);
      if (cancelled) return;
      setLeadResults(Array.isArray(data) ? data : []);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setSearching(false); };
  }, [leadQuery, open]);

  const threadKey = useMemo(() => (lead ? `lead:${lead.id}` : `quick:${user?.id ?? 'anon'}`), [lead, user?.id]);

  const resetAfterSave = () => {
    setNoteText('');
    setReminderTitle('');
    setInteractionText('');
    setReminderWhen(localDefaultDue());
  };

  const loadCalendarSlots = async () => {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-availability', {
        body: { lead_id: lead?.id ?? null, duration_minutes: 30, create_booking_token: false },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'calendar_unavailable');
      const slots = Array.isArray(data.slots) ? data.slots : [];
      setCalendarSlots(slots);
      setCalendarConnected(true);
      if (slots[0]?.start) setReminderWhen(toLocalDateTime(slots[0].start));
    } catch {
      setCalendarSlots([]);
      setCalendarConnected(false);
    } finally {
      setCalendarLoading(false);
    }
  };

  // Live property search for the note tab.
  useEffect(() => {
    if (!open) return;
    const q = listingQuery.trim();
    if (q.length < 2) { setListingResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('listings')
        .select('id, property_title, city, neighborhood, rooms, asking_price, deal_type')
        .or(`property_title.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(8);
      if (cancelled) return;
      setListingResults(Array.isArray(data) ? data : []);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [listingQuery, open]);

  async function logActivity(actionType: string, platform: string, content: string) {
    if (!user) return;
    const { error } = await (supabase as any).from('interaction_activity_log').insert({
      user_id: user.id,
      thread_key: threadKey,
      platform,
      action_type: actionType,
      actor_type: 'human',
      actor_id: user.id,
      actor_label: 'סוכן',
      content,
      metadata: {
        lead_id: lead?.id ?? null,
        listing_id: listing?.id ?? null,
        source: 'quick_action_drawer',
      },
    });
    if (error) throw error;
  }

  const saveNote = async () => {
    if (!noteText.trim()) { toast.error('כתוב תוכן לפתק'); return; }
    setSaving(true);
    try {
      await logActivity('note', 'internal', noteText.trim());
      if (lead?.id) {
        await (supabase as any).from('leads').update({ last_interaction_at: new Date().toISOString() }).eq('id', lead.id);
      }
      toast.success('הפתק נשמר');
      resetAfterSave();
      queryClient.invalidateQueries({ queryKey: ['property-notes'] });
      queryClient.invalidateQueries({ queryKey: ['command-center-tasks'] });
      invalidateLiveData(queryClient);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירת הרשומה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const saveReminder = async () => {
    if (!reminderTitle.trim()) { toast.error('כתוב כותרת לתזכורת'); return; }
    if (!reminderWhen) { toast.error('בחר מועד'); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('scheduled_items').insert({
        user_id: user!.id,
        title: reminderTitle.trim(),
        content: noteText.trim() || reminderTitle.trim(),
        item_type: 'task',
        channel: 'internal',
        status: 'pending',
        scheduled_for: new Date(reminderWhen).toISOString(),
        metadata: {
          lead_id: lead?.id ?? null,
          lead_name: lead?.full_name ?? null,
          priority: reminderPriority,
          action_type: 'follow_up',
          source: 'quick_action_drawer',
        },
      });
      if (error) throw error;
      if (calendarConnected) {
        const { data: calendarData, error: calendarError } = await supabase.functions.invoke('calendar-schedule-action', {
          body: {
            title: reminderTitle.trim(),
            notes: noteText.trim(),
            starts_at: new Date(reminderWhen).toISOString(),
            duration_minutes: 30,
            lead_id: lead?.id ?? null,
          },
        });
        if (calendarError || !calendarData?.ok) throw new Error(calendarData?.error || calendarError?.message || 'Calendar sync failed');
      }
      toast.success('התזכורת נקבעה');
      resetAfterSave();
      invalidateLiveData(queryClient);
    } catch (e: any) {
      toast.error(e?.message ?? 'קביעת התזכורת נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const saveInteraction = async () => {
    if (!lead) { toast.error('בחר מתעניין'); return; }
    if (!interactionText.trim()) { toast.error('כתוב סיכום שיחה'); return; }
    setSaving(true);
    try {
      await logActivity('interaction', interactionChannel, interactionText.trim());
      await (supabase as any).from('leads').update({ last_interaction_at: new Date().toISOString() }).eq('id', lead.id);
      toast.success('סיכום השיחה נשמר');
      resetAfterSave();
      invalidateLiveData(queryClient);

    } catch (e: any) {
      toast.error(e?.message ?? 'שמירת סיכום השיחה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const loadMatches = async () => {
    setMatchesLoading(true);
    setMatches(null);
    try {
      let q = (supabase as any)
        .from('listings')
        .select('id, property_title, city, neighborhood, rooms, asking_price, deal_type')
        .order('created_at', { ascending: false })
        .limit(10);
      if (lead?.city) q = q.ilike('city', `%${lead.city}%`);
      if (lead?.deal_type) q = q.eq('deal_type', lead.deal_type);
      const { data, error } = await q;
      if (error) throw error;
      setMatches(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.message ?? 'טעינת ההתאמות נכשלה');
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'matches') loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, lead?.id]);

  const leadPicker = (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">איש קשר</Label>
      {lead ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{lead.full_name || 'ללא שם'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {lead.phone_number ? formatPhoneDisplay(lead.phone_number) : '—'}{lead.city ? ` · ${lead.city}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setLead(null); setLeadQuery(''); }}>
            החלף
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" style={{ insetInlineStart: '0.75rem' }} />
            <Input
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              className="ps-9"
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">מחפש…</p>}
          {leadResults.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {leadResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setLead(r); setLeadResults([]); }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right transition hover:bg-accent"
                >
                  <span className="truncate text-sm font-semibold">{r.full_name || 'ללא שם'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.phone_number ? formatPhoneDisplay(r.phone_number) : ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" dir="rtl" className="flex w-full flex-col gap-0 overflow-y-auto border-border bg-background p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border bg-muted/40 px-5 py-4 text-center">
            <SheetTitle className="flex items-center justify-center gap-2 text-lg font-extrabold">
              <Zap className="h-5 w-5 text-primary" />
              פעולות מהירות
            </SheetTitle>
          </SheetHeader>

          <div className="grid grid-cols-4 gap-1 border-b border-border bg-background px-3 py-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`group flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-bold transition ${
                    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 space-y-4 px-5 py-4">
            {leadPicker}

            {tab === 'note' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">נכס מקושר</Label>
                  {listing ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
                      <p className="truncate text-sm font-bold text-foreground">
                        {listing.property_title || [listing.neighborhood, listing.city].filter(Boolean).join(', ') || 'נכס'}
                      </p>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setListing(null); setListingQuery(''); }}>
                        החלף
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={listingQuery}
                        onChange={(e) => setListingQuery(e.target.value)}
                        placeholder="חיפוש נכס לפי כתובת, עיר או כותרת"
                      />
                      {listingResults.length > 0 && (
                        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                          {listingResults.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => { setListing(r); setListingResults([]); }}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-right transition hover:bg-accent"
                            >
                              <span className="truncate text-sm font-semibold">
                                {r.property_title || [r.neighborhood, r.city].filter(Boolean).join(', ') || 'נכס'}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">{r.city ?? ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">תוכן הפתק</Label>
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                </div>
                <Button className="w-full font-bold" onClick={saveNote} disabled={saving}>
                  {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <StickyNote className="me-2 h-4 w-4" />}
                  שמור פתק
                </Button>
              </div>
            )}

            {tab === 'reminder' && (
              <div className="space-y-3">
                <div className="space-y-2">
                        <Label className="text-sm font-semibold">כותרת</Label>
                  <Input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} />
                </div>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={loadCalendarSlots} disabled={calendarLoading}>
                  {calendarLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />}
                  בדיקת זמינות ביומן Google
                </Button>
                {calendarConnected === false && <p className="text-sm text-muted-foreground">היומן אינו מחובר. ניתן לבחור מועד ידנית.</p>}
                {calendarSlots.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {calendarSlots.map((slot) => {
                      const value = toLocalDateTime(slot.start);
                      const selected = reminderWhen === value;
                      return (
                        <Button key={slot.start} type="button" variant={selected ? 'default' : 'outline'} onClick={() => setReminderWhen(value)} className="justify-between">
                          <span>{new Date(slot.start).toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                          <span>{new Date(slot.start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className={selected ? 'text-primary-foreground' : 'text-success'}>פנוי</span>
                        </Button>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">מועד</Label>
                    <Input type="datetime-local" value={reminderWhen} onChange={(e) => setReminderWhen(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">דחיפות</Label>
                    <Select value={reminderPriority} onValueChange={setReminderPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">גבוהה</SelectItem>
                        <SelectItem value="medium">בינונית</SelectItem>
                        <SelectItem value="low">נמוכה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">הערה</Label>
                  <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} className="resize-none" />
                </div>
                <Button className="w-full font-bold" onClick={saveReminder} disabled={saving}>
                  {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <BellRing className="me-2 h-4 w-4" />}
                  קבע תזכורת
                </Button>
              </div>
            )}

            {tab === 'interaction' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">ערוץ</Label>
                  <Select value={interactionChannel} onValueChange={setInteractionChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">סיכום שיחה</Label>
                  <Textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    rows={5}
                    className="resize-none"
                  />
                </div>
                <Button className="w-full font-bold" onClick={saveInteraction} disabled={saving}>
                  {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="me-2 h-4 w-4" />}
                  שמור סיכום שיחה
                </Button>
              </div>
            )}

            {tab === 'matches' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {lead ? `נכסים שמתאימים ל${lead.full_name || 'מתעניין'}` : 'הנכסים העדכניים במערכת'}
                  </p>
                  <Button variant="outline" size="sm" className="text-xs" onClick={loadMatches} disabled={matchesLoading}>
                    רענון
                  </Button>
                </div>
                {matchesLoading && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {!matchesLoading && matches?.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    לא נמצאו נכסים מתאימים
                  </p>
                )}
                <div className="space-y-2">
                  {(matches ?? []).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setOpen(false); navigate(`/properties/${m.id}`); }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-right transition hover:border-primary hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{m.property_title || 'נכס ללא כותרת'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[m.city, m.neighborhood, m.rooms ? `${m.rooms} חד׳` : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {m.asking_price ? <Badge variant="secondary" className="text-[11px]">₪{Number(m.asking_price).toLocaleString('he-IL')}</Badge> : null}
                        <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
                {lead && (
                  <Button variant="outline" className="w-full text-sm font-bold" onClick={() => { setOpen(false); navigate(`/lead-crm/${lead.id}`); }}>
                    פתח כרטיס מתעניין
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
