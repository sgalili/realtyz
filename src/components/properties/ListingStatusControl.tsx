// ============================================================
// Listing status control
// ------------------------------------------------------------
// Lets the broker put a property on hold or close it (sold / rented /
// disabled). Any of those states stops the property everywhere: a DB trigger
// purges every future scheduled campaign post, and the AI / landing / share
// surfaces treat it as inactive.
// ============================================================
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export const LISTING_STATUS_LABELS: Record<string, string> = {
  live: 'פעיל',
  pending: 'ממתין לאישור',
  hold: 'בהמתנה',
  sold: 'נמכר',
  rented: 'הושכר',
  disabled: 'מושבת',
};

/** Statuses that stop all promotion of the property. */
export const STOPPED_LISTING_STATUSES = ['hold', 'sold', 'rented', 'disabled', 'discarded'];

export const isListingActive = (status?: string | null): boolean =>
  !STOPPED_LISTING_STATUSES.includes(String(status ?? 'live'));

export function ListingStatusControl({
  listingId, status, onChanged,
}: {
  listingId: string;
  status?: string | null;
  onChanged?: (next: string) => void;
}) {
  const [value, setValue] = useState<string>(String(status || 'live'));
  const [saving, setSaving] = useState(false);

  const update = async (next: string) => {
    setSaving(true);
    const prev = value;
    setValue(next);
    try {
      const { error } = await supabase.from('listings').update({ status: next }).eq('id', listingId);
      if (error) throw error;
      onChanged?.(next);
      toast.success(
        isListingActive(next)
          ? `הנכס סומן כ${LISTING_STATUS_LABELS[next] ?? next}`
          : `הנכס סומן כ${LISTING_STATUS_LABELS[next] ?? next} · כל הפרסומים העתידיים בוטלו`,
      );
    } catch (e: any) {
      setValue(prev);
      toast.error('עדכון סטטוס הנכס נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select value={value} onValueChange={update} disabled={saving}>
      <SelectTrigger
        className={`h-9 w-[150px] text-[13px] ${isListingActive(value) ? '' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}
        dir="rtl"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent dir="rtl">
        {Object.entries(LISTING_STATUS_LABELS).map(([k, label]) => (
          <SelectItem key={k} value={k} className="text-[13px]">{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
