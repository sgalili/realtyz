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
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, Home, KeyRound } from 'lucide-react';
import { useServiceAreas } from '@/hooks/useServiceAreas';

type DealType = 'sale' | 'rent';

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
  defaultDealType?: DealType;
}

export default function NewLeadDialog({ open, onOpenChange, defaultDealType = 'sale' }: Props) {
  const queryClient = useQueryClient();
  const { checkInArea, isConfigured, serviceAreas } = useServiceAreas();
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
  const [saving, setSaving] = useState(false);
  /** When user attempts to save an out-of-area lead, we hold the action and ask to confirm. */
  const [pendingOutOfArea, setPendingOutOfArea] = useState(false);

  function reset() {
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
    setPendingOutOfArea(false);
  }

  async function handleSave(opts: { force?: boolean } = {}) {
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
      listing_type: dealType, // legacy mirror for older code paths
      rooms: rooms ? Number(rooms) : undefined,
      notes: notes.trim() || undefined,
    };
    if (dealType === 'sale') {
      preferences.budget_max = budgetMax ? Number(budgetMax) : undefined;
      preferences.financing = financing;
    } else {
      preferences.monthly_rent_max = monthlyMax ? Number(monthlyMax) : undefined;
      preferences.move_in_date = moveInDate || undefined;
    }
    // Strip undefined keys for a clean jsonb payload
    Object.keys(preferences).forEach(
      (k) => preferences[k] === undefined && delete preferences[k],
    );

    setSaving(true);
    try {
      const { error } = await supabase.from('leads').insert({
        full_name: fullName.trim(),
        phone_number: normalizedPhone,
        email: email.trim() || null,
        city: city.trim() || null,
        neighborhood: neighborhood.trim() || null,
        deal_type: dealType,
        preferences,
        lead_stage: 'new',
        interest_tag: dealType === 'sale' ? 'דירה למכירה' : 'דירה להשכרה',
      } as any);
      if (error) throw error;
      toast.success('הליד נוצר בהצלחה', {
        description: `${fullName.trim()} נוסף לניהול מתעניינים ${dealType === 'sale' ? 'מכירה' : 'השכרה'}`,
      });
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
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
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            מתעניין חדש
          </DialogTitle>
          <DialogDescription>
            בחרו תחילה את סוג העסקה — השדות יותאמו אוטומטית לניהול מתעניינים הנכון.
          </DialogDescription>
        </DialogHeader>

        {/* Deal type selector — drives the dynamic field set */}
        <Tabs value={dealType} onValueChange={(v) => setDealType(v as DealType)} dir="rtl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sale" className="gap-2">
              <Home className="h-4 w-4" /> מכירה
            </TabsTrigger>
            <TabsTrigger value="rent" className="gap-2">
              <KeyRound className="h-4 w-4" /> השכרה
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="050-1234567"
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
            <Label htmlFor="nl-city">עיר מועדפת</Label>
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

          {/* DYNAMIC: Sale-only fields */}
          {dealType === 'sale' && (
            <>
              <div>
                <Label htmlFor="nl-budget">תקציב מקסימום (₪)</Label>
                <Input
                  id="nl-budget"
                  type="number"
                  min="0"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="2500000"
                />
              </div>
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
            </>
          )}

          {/* DYNAMIC: Rent-only fields */}
          {dealType === 'rent' && (
            <>
              <div>
                <Label htmlFor="nl-monthly">שכ״ד חודשי מקסימום (₪)</Label>
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
                <Label htmlFor="nl-movein">תאריך כניסה רצוי</Label>
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
            <Label htmlFor="nl-notes">הערות</Label>
            <Textarea
              id="nl-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="פרטים שיעזרו לסגור את העסקה…"
            />
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={() => handleSave()} disabled={saving || pendingOutOfArea}>
            {saving ? 'יוצר…' : `הוסף ל${dealType === 'sale' ? 'מכירה' : 'השכרה'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
