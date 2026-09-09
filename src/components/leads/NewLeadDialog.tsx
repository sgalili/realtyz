/**
 * NewLeadDialog
 * -------------
 * Lightweight "Add Lead" form opened from the Lead CRM toolbar.
 *
 * Hard pipeline separation: the deal_type toggle (מכירה / השכרה) drives which
 * downstream fields render. A Sale lead exposes purchase budget + financing,
 * a Rent lead exposes monthly budget + move-in date — and we never persist
 * the "wrong" set of fields, so the AI Co-Pilot can never accidentally cross-
 * market mortgages to a renter or rentals to a buyer.
 *
 * The deal_type lives in the new top-level `leads.deal_type` column AND is
 * mirrored into `preferences.listing_type` for backward compat with older
 * code paths (importer, demo data, persona prompt fallback).
 */
import { useState } from 'react';
import LinkedPropertiesField, { saveLeadPropertyLinks } from '@/components/leads/LinkedPropertiesField';

import { supabase } from '@/integrations/supabase/client';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatPhoneAsTyped } from '@/lib/formatPhone';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus } from 'lucide-react';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DealType = 'sale' | 'rent';
/** Contact kind — mirrors preferences.lead_kind used across the CRM. */
type LeadKind = 'buyer' | 'seller' | 'renter' | 'landlord' | 'broker';

const KIND_OPTIONS: { v: LeadKind; l: string }[] = [
  { v: 'buyer', l: 'קונה' },
  { v: 'seller', l: 'מוכר' },
  { v: 'renter', l: 'שוכר' },
  { v: 'landlord', l: 'משכיר' },
  { v: 'broker', l: 'מתווך' },
];

/** Each contact kind pins its own deal_type + Hebrew interest tag. */
const KIND_MAP: Record<LeadKind, { deal: DealType; tag: string }> = {
  buyer: { deal: 'sale', tag: 'דירה למכירה' },
  seller: { deal: 'sale', tag: 'מוכר נכס' },
  renter: { deal: 'rent', tag: 'דירה להשכרה' },
  landlord: { deal: 'rent', tag: 'משכיר נכס' },
  broker: { deal: 'sale', tag: 'מתווך' },
};

function normalizeIsraeliPhone(raw: string): string | null {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('5') && digits.length === 9) digits = '0' + digits;
  if (!/^05\d{8}$/.test(digits)) return null;
  return '972' + digits.slice(1);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional: pre-select the pipeline (used when launched from a Sale/Rent context). */
  defaultDealType?: 'sale' | 'rent';
}

export default function NewLeadDialog({ open, onOpenChange, defaultDealType = 'sale' }: Props) {
  const queryClient = useQueryClient();
  const { checkInArea, isConfigured, serviceAreas } = useServiceAreas();
  const activeWorkspaceId = useActiveWorkspaceOwnerId();
  const { user } = useAuth();
  const [leadKind, setLeadKind] = useState<LeadKind | null>(null);
  const [dealType, setDealType] = useState<DealType>(defaultDealType);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');

  // Sale-only fields
  const [budgetMax, setBudgetMax] = useState('');
  const [financing, setFinancing] = useState<'cash' | 'mortgage' | 'unknown'>('unknown');

  // Rent-only fields
  const [monthlyMax, setMonthlyMax] = useState('');
  const [moveInDate, setMoveInDate] = useState('');

  // Shared
  const [rooms, setRooms] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [linkedListings, setLinkedListings] = useState<string[]>([]);
  /** When user attempts to save an out-of-area lead, we hold the action and ask to confirm. */
  const [pendingOutOfArea, setPendingOutOfArea] = useState(false);

  /** Rental side of the business (renter looking, or landlord offering). */
  const isRental = dealType === 'rent';
  /** Owners list property data instead of search preferences. */
  const isOwner = leadKind === 'seller' || leadKind === 'landlord';

  /** Picking a contact kind pins the matching pipeline automatically. */
  function pickKind(kind: LeadKind) {
    setLeadKind(kind);
    setDealType(KIND_MAP[kind].deal);
  }

  function reset() {
    setLeadKind(null);
    setDealType(defaultDealType);
    setFullName('');
    setPhone('');
    setEmail('');
    setCity('');
    setNeighborhood('');
    setBudgetMax('');
    setFinancing('unknown');
    setMonthlyMax('');
    setMoveInDate('');
    setRooms('');
    setNotes('');
    setSource('manual');
    setPendingOutOfArea(false);
    setLinkedListings([]);
  }

  /** Resolve which account the contact belongs to (workspace owner or self). */
  async function resolveOwnerId(): Promise<string | null> {
    const uid = user?.id ?? null;
    if (!activeWorkspaceId || !uid || activeWorkspaceId === uid) return uid;
    try {
      const { data } = await supabase
        .from('workspace_memberships')
        .select('workspace_owner_id')
        .eq('user_id', uid)
        .eq('workspace_owner_id', activeWorkspaceId)
        .maybeSingle();
      return data ? activeWorkspaceId : uid;
    } catch {
      return uid;
    }
  }

  async function handleSave(opts: { force?: boolean } = {}) {
    if (!leadKind) {
      toast.error('יש לבחור סוג איש קשר');
      return;
    }
    if (!fullName.trim()) {
      toast.error('שם מלא הוא שדה חובה');
      return;
    }
    const normalizedPhone = normalizeIsraeliPhone(phone);
    if (!normalizedPhone) {
      toast.error('מספר טלפון לא תקין', {
        description: 'נדרש מספר ישראלי בפורמט 05X-XXXXXXX',
      });
      return;
    }

    // Hyper-local guard: if agent has configured service_areas, warn before
    // saving a lead outside their patch. Soft prompt only, never blocks.
    if (
      !opts.force &&
      isConfigured &&
      city.trim() &&
      !checkInArea(city.trim(), neighborhood.trim() || null)
    ) {
      setPendingOutOfArea(true);
      return;
    }

    // Build pipeline-specific preferences. We deliberately omit the OTHER
    // pipeline's fields so the AI never sees, e.g., a mortgage flag on a
    // rental lead.
    const preferences: Record<string, unknown> = {
      lead_kind: leadKind!,
      listing_type: isRental ? 'rent' : 'sale', // legacy mirror for older code paths
      deal_side: isOwner ? 'owner' : 'seeker',
      source,
      lead_source: source,
      rooms: rooms ? Number(rooms) : undefined,
      notes: notes.trim() || undefined,
    };
    if (isRental) {
      const monthly = monthlyMax ? Number(monthlyMax) : undefined;
      if (isOwner) preferences.monthly_rent = monthly;
      else preferences.monthly_rent_max = monthly;
      preferences.move_in_date = moveInDate || undefined;
    } else {
      const price = budgetMax ? Number(budgetMax) : undefined;
      if (isOwner) preferences.asking_price = price;
      else {
        preferences.budget_max = price;
        preferences.financing = financing;
      }
    }
    // Strip undefined keys for a clean jsonb payload
    Object.keys(preferences).forEach(
      (k) => preferences[k] === undefined && delete preferences[k],
    );

    setSaving(true);
    try {
      const ownerId = await resolveOwnerId();
      const payload = {
        full_name: fullName.trim(),
        phone_number: normalizedPhone,
        email: email.trim() || null,
        city: city.trim() || null,
        neighborhood: neighborhood.trim() || null,
        deal_type: dealType,
        preferences,
        lead_stage: 'new',
        status: 'new',
        assigned_to: ownerId,
        interest_tag: KIND_MAP[leadKind].tag,
      } as any;

      let created: any = null;
      let merged = false;

      const ins = await supabase.from('leads').insert(payload).select('id').maybeSingle();
      if (ins.error) {
        const dup =
          ins.error.code === '23505' ||
          /duplicate key value|leads_phone_number/i.test(ins.error.message || '');
        if (!dup) throw ins.error;

        // A contact with this phone already exists — merge into it instead of failing.
        const existing = await supabase
          .from('leads')
          .select('id')
          .eq('assigned_to', ownerId)
          .eq('phone_number', normalizedPhone)
          .limit(1)
          .maybeSingle();
        if (existing.error || !existing.data?.id) {
          toast.error('קיים כבר איש קשר עם מספר הטלפון הזה', {
            description: 'חפשו אותו ברשימת אנשי הקשר ועדכנו את הפרטים שם.',
          });
          return;
        }
        const upd = await supabase
          .from('leads')
          .update({
            full_name: payload.full_name,
            email: payload.email,
            city: payload.city,
            neighborhood: payload.neighborhood,
            deal_type: payload.deal_type,
            preferences: payload.preferences,
            interest_tag: payload.interest_tag,
          } as any)
          .eq('id', existing.data.id)
          .select('id')
          .maybeSingle();
        if (upd.error) throw upd.error;
        created = upd.data;
        merged = true;
      } else {
        created = ins.data;
      }

      // Property relation — persist the linked properties for this contact.
      if (created?.id && linkedListings.length) {
        try {
          await saveLeadPropertyLinks(created.id, linkedListings);
          queryClient.invalidateQueries({ queryKey: ['lead-listings', created.id] });
        } catch {
          toast.error('קישור הנכסים לא נשמר במלואו');
        }
      }


      // Background WhatsApp profile-picture hydration — never blocks the save.
      if (created?.id) {
        supabase.functions
          .invoke('fetch-wa-avatars', { body: { lead_ids: [created.id] } })
          .then(() => queryClient.invalidateQueries({ queryKey: ['leads'] }))
          .catch(() => {});
      }

      toast.success(merged ? 'איש הקשר עודכן' : 'איש הקשר נוצר בהצלחה', {
        description: merged
          ? `${fullName.trim()} · כבר היה במאגר עם אותו טלפון, הפרטים עודכנו`
          : `${fullName.trim()} · ${KIND_OPTIONS.find((k) => k.v === leadKind)?.l}`,
      });
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['deal-room-leads'] });
    } catch (err: any) {
      toast.error('יצירת הליד נכשלה', { description: err?.message });
    } finally {
      setSaving(false);
    }

  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            איש קשר חדש
          </DialogTitle>
  
        </DialogHeader>

        {/* Contact kind — pins the pipeline and the dynamic field set */}
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-1.5">
            {KIND_OPTIONS.map((k) => (
              <Button
                key={k.v}
                type="button"
                size="sm"
                variant={leadKind === k.v ? 'default' : 'outline'}
                className="text-xs px-1"
                onClick={() => pickKind(k.v)}
              >
                {k.l}
              </Button>
            ))}
          </div>
        </div>


        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="col-span-2">
            <Label htmlFor="nl-name">שם מלא *</Label>
            <Input
              id="nl-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ישראל ישראלי"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="nl-phone">טלפון *</Label>
            <Input
              id="nl-phone"
              dir="ltr"
              value={formatPhoneAsTyped(phone)}
              onChange={(e) => setPhone(formatPhoneAsTyped(e.target.value))}
              inputMode="tel"
            />
          </div>
          <div>
            <Label htmlFor="nl-email">אימייל</Label>
            <Input
              id="nl-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lead@example.com"
            />
          </div>
          <div>
            <Label htmlFor="nl-city">עיר</Label>
            <Input
              id="nl-city"
              value={city}
              onChange={(e) => { setCity(e.target.value); setPendingOutOfArea(false); }}
              placeholder="תל אביב"
            />
          </div>
          <div>
            <Label htmlFor="nl-hood">שכונה</Label>
            <Input
              id="nl-hood"
              value={neighborhood}
              onChange={(e) => { setNeighborhood(e.target.value); setPendingOutOfArea(false); }}
              placeholder="צפון הישן"
            />
          </div>
          <div>
            <Label htmlFor="nl-rooms">חדרים</Label>
            <Input
              id="nl-rooms"
              type="number"
              step="0.5"
              min="1"
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              placeholder="3"
            />
          </div>

          {/* Arrival channel — keeps the CRM "ערוץ הגעה" field filled from day one */}
          <div>
            <Label>ערוץ הגעה</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="בחר ערוץ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">הוזן ידנית</SelectItem>
                <SelectItem value="whatsapp">וואטסאפ</SelectItem>
                <SelectItem value="facebook">פייסבוק</SelectItem>
                <SelectItem value="facebook_groups">פייסבוק קבוצות</SelectItem>
                <SelectItem value="instagram">אינסטגרם</SelectItem>
                <SelectItem value="inbound_call">שיחה נכנסת</SelectItem>
                <SelectItem value="yad2">יד2</SelectItem>
                <SelectItem value="website">אתר</SelectItem>
                <SelectItem value="homely">הומלי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* DYNAMIC: sale side (buyer budget / owner asking price) */}
          {!isRental && (
            <>
              <div>
                <Label htmlFor="nl-budget">{isOwner ? 'מחיר מבוקש (₪)' : 'תקציב מקסימום (₪)'}</Label>
                <Input
                  id="nl-budget"
                  type="number"
                  min="0"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="2500000"
                />
              </div>
              {!isOwner && (
                <div>
                  <Label htmlFor="nl-fin">מימון</Label>
                  <select
                    id="nl-fin"
                    value={financing}
                    onChange={(e) => setFinancing(e.target.value as any)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="unknown">לא ידוע עדיין</option>
                    <option value="cash">מזומן</option>
                    <option value="mortgage">משכנתא</option>
                  </select>
                </div>
              )}
            </>
          )}

          {/* DYNAMIC: rental side (renter budget / landlord asking rent) */}
          {isRental && (
            <>
              <div>
                <Label htmlFor="nl-monthly">{isOwner ? 'שכ״ד מבוקש (₪ לחודש)' : 'שכ״ד חודשי מקסימום (₪)'}</Label>
                <Input
                  id="nl-monthly"
                  type="number"
                  min="0"
                  value={monthlyMax}
                  onChange={(e) => setMonthlyMax(e.target.value)}
                  placeholder="6500"
                />
              </div>
              <div>
                <Label htmlFor="nl-movein">{isOwner ? 'תאריך פינוי / כניסה' : 'תאריך כניסה רצוי'}</Label>
                <Input
                  id="nl-movein"
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                />
              </div>
            </>
          )}


          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nl-notes">הערות</Label>
              <VoiceInputButton
                size="sm"
                title="הכתבה קולית להערות"
                onTranscript={(t) => setNotes((prev) => (prev ? `${prev} ${t}` : t))}
              />
            </div>
            <Textarea
              id="nl-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="פרטים שיעזרו לסגור את העסקה…"
            />
          </div>

          {/* Property relation — link one or many properties to this contact */}
          <div className="col-span-2">
            <LinkedPropertiesField value={linkedListings} onChange={setLinkedListings} />
          </div>
        </div>


        {pendingOutOfArea && (
          <div
            role="alert"
            className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100"
          >
            <div className="font-semibold mb-1">שים לב: מחוץ לאזור ההתמחות שלך</div>
            <div>
              העיר/שכונה שהזנת לא נמצאת ב-{serviceAreas.length} האזורים שהוגדרו
              בהגדרות. האם להוסיף את הליד בכל זאת?
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPendingOutOfArea(false)}
              >
                חזור לעריכה
              </Button>
              <Button size="sm" onClick={() => handleSave({ force: true })} disabled={saving}>
                הוסף בכל זאת
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={() => handleSave()} disabled={saving || pendingOutOfArea || !leadKind}>
            {saving ? 'יוצר…' : leadKind ? `הוסף ${KIND_OPTIONS.find((k) => k.v === leadKind)?.l}` : 'הוסף איש קשר'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
