import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Users, Home, Search, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';

export type ScheduledSeriesRow = {
  id: string;
  channel?: string | null;
  campaign_name?: string | null;
  message_body?: string | null;
  media_urls?: any;
  group_ids?: any;
  listing_id?: string | null;
  series_id?: string | null;
  series_total?: number | null;
  recurrence_rule?: string | null;
  sent_at?: string | null;
};

type ListingOption = { id: string; label: string };

/**
 * Edit a live / repeating scheduled campaign on the fly: add or remove target
 * Facebook groups and add more properties to the running series. Group changes
 * apply to every future occurrence of the series; added properties are queued
 * as new scheduled posts that the dispatcher generates content for.
 */
export function EditScheduledSeriesDialog({
  open, onOpenChange, row, onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: ScheduledSeriesRow | null;
  onUpdated?: () => void;
}) {
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [extraListingIds, setExtraListingIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Autosuggest search over the local catalogue, with a Yad2 fallback import.
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<ListingOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setGroupIds(Array.isArray(row.group_ids) ? row.group_ids.map(String) : []);
    setExtraListingIds([]);
    void (async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, property_title, address, city, status')
        .order('updated_at', { ascending: false })
        .limit(60);
      setListings(((data ?? []) as any[])
        .filter((l) => !['sold', 'rented', 'hold', 'disabled'].includes(String(l.status || '')))
        .map((l) => ({
          id: l.id,
          label: [l.property_title, l.address, l.city].filter(Boolean).join(' · ') || l.id,
        })));
    })();
  }, [open, row]);

  // Debounced DB search (2+ chars) so the picker is not limited to the 60
  // most-recent listings.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setRemote([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, property_title, address, city, neighborhood, status')
        .or(`property_title.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,neighborhood.ilike.%${q}%`)
        .limit(30);
      if (cancelled) return;
      setRemote(((data ?? []) as any[])
        .filter((l) => !['sold', 'rented', 'hold', 'disabled'].includes(String(l.status || '')))
        .map((l) => ({
          id: l.id,
          label: [l.property_title, l.address, l.city].filter(Boolean).join(' · ') || l.id,
        })));
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); setSearching(false); };
  }, [query, open]);

  const alreadyIncluded = useMemo(
    () => new Set([row?.listing_id].filter(Boolean) as string[]),
    [row?.listing_id],
  );

  // Merge local + DB matches, de-duped, filtered by the free-text query.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const merged = new Map<string, ListingOption>();
    for (const l of [...remote, ...listings]) {
      if (alreadyIncluded.has(l.id)) continue;
      if (q && !l.label.toLowerCase().includes(q)) continue;
      if (!merged.has(l.id)) merged.set(l.id, l);
    }
    return Array.from(merged.values());
  }, [remote, listings, alreadyIncluded, query]);

  /** Nothing local matched: pull the property from Yad2 and import it. */
  const importFromYad2 = async () => {
    const q = query.trim();
    if (!q) return;
    setImporting(true);
    try {
      const isUrl = /^https?:\/\//i.test(q);
      const { data, error } = isUrl
        ? await supabase.functions.invoke('yad2-unlocker', { body: { url: q, limit: 1 } })
        : await supabase.functions.invoke('yad2-search', { body: { q, limit: 20 } });
      if (error) throw error;
      const imported = Array.isArray((data as any)?.results) ? (data as any).results.length : 0;
      const { data: fresh } = await supabase
        .from('listings')
        .select('id, property_title, address, city, status')
        .or(`property_title.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(20);
      const opts = ((fresh ?? []) as any[]).map((l) => ({
        id: l.id,
        label: [l.property_title, l.address, l.city].filter(Boolean).join(' · ') || l.id,
      }));
      setRemote(opts);
      if (opts.length === 0) toast.error('לא נמצא נכס מתאים ביד2');
      else toast.success(`יובאו ${imported || opts.length} נכסים מיד2`);
    } catch (e: any) {
      toast.error(`ייבוא מיד2 נכשל: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const cleanGroups = Array.from(new Set(groupIds.map((g) => String(g).replace(/^ext:/, '')).filter(Boolean)));

      // 1) Apply the new group targets to every future occurrence of the series.
      const nowIso = new Date().toISOString();
      let updateQuery = supabase
        .from('campaign_logs')
        .update({ group_ids: cleanGroups } as any)
        .eq('status', 'scheduled')
        .gte('sent_at', nowIso);
      updateQuery = row.series_id
        ? updateQuery.eq('series_id', row.series_id)
        : updateQuery.eq('id', row.id);
      const { error: upErr } = await updateQuery;
      if (upErr) throw upErr;

      // 2) Queue the added properties as new scheduled posts on the same slot.
      if (extraListingIds.length > 0) {
        const { data: full } = await supabase
          .from('campaign_logs')
          .select('*')
          .eq('id', row.id)
          .maybeSingle();
        const base: any = full ?? row;
        const rows = extraListingIds.map((listingId) => ({
          user_id: base.user_id,
          workspace_owner_id: base.workspace_owner_id ?? base.user_id,
          campaign_name: base.campaign_name,
          channel: base.channel ?? 'facebook',
          message_body: base.message_body ?? '',
          media_urls: [],
          group_ids: cleanGroups,
          listing_id: listingId,
          status: 'scheduled',
          sent_at: base.sent_at,
          needs_regeneration: true,
          recurrence_rule: base.recurrence_rule ?? null,
          series_id: base.series_id ?? null,
          first_comment: base.first_comment ?? null,
          regen_prompt: base.regen_prompt ?? null,
        }));
        const { error: insErr } = await (supabase as any).from('campaign_logs').insert(rows);
        if (insErr) throw insErr;
      }

      toast.success(
        `הסדרה עודכנה · ${cleanGroups.length} קבוצות${extraListingIds.length ? ` · נוספו ${extraListingIds.length} נכסים` : ''}`,
      );
      onUpdated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`עדכון הסדרה נכשל: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle className="text-right text-base">עריכת קמפיין מתוזמן</DialogTitle>
          <DialogDescription className="text-right text-[13px]">
            הוסף קבוצות ונכסים לקמפיין שרץ כרגע. השינוי חל על כל השידורים העתידיים בסדרה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">


          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Home className="h-4 w-4" /> הוספת נכסים לסדרה
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{extraListingIds.length}</span>
            </div>
            <div className="relative mb-2">
              <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש נכס לפי כתובת, שכונה, עיר או קישור יד2"
                className="pr-8 text-[13px]"
              />
              {searching && (
                <Loader2 className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="max-h-[28vh] space-y-1 overflow-y-auto overscroll-contain">
              {suggestions.length === 0 && (
                <div className="space-y-2 py-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    {query.trim().length >= 2 ? 'לא נמצא נכס תואם במערכת' : 'לא נמצאו נכסים פעילים'}
                  </p>
                  {query.trim().length >= 2 && (
                    <Button size="sm" variant="outline" onClick={() => void importFromYad2()} disabled={importing}>
                      {importing
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Download className="ms-1 h-4 w-4" /> ייבוא מיד2</>}
                    </Button>
                  )}
                </div>
              )}
              {suggestions.map((l) => {
                const checked = extraListingIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setExtraListingIds((curr) => (
                      checked ? curr.filter((x) => x !== l.id) : [...curr, l.id]
                    ))}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-[13px] transition ${
                      checked ? 'border-primary/50 bg-primary/10 font-semibold text-primary' : 'border-border bg-background hover:bg-muted/50'
                    }`}
                  >
                    <span className="truncate">{l.label}</span>
                    <span className="shrink-0 text-xs">{checked ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור שינויים'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditScheduledSeriesDialog;
