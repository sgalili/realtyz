import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Decision = {
  profileKey?: string;
  keyPrefix: string;
  refId: string | null;
  title: string | null;
  suspended: boolean;
  userStatus: number;
  linkedCount: number;
  linked: string[];
  reason: string | null;
  willDelete: boolean;
  deleted?: { ok: boolean; status: number } | null;
};

type Response = {
  ok: boolean;
  dry_run: boolean;
  total_profiles: number;
  targets_count: number;
  deleted_count: number;
  protected_keys: string[];
  decisions: Decision[];
};

export function AyrshareBulkPurgeCard() {
  const [includeOrphans, setIncludeOrphans] = useState(true);
  const [forceDeleteAll, setForceDeleteAll] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<Response | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Identify each row by refId when present, otherwise fall back to profileKey/keyPrefix.
  const rowId = (d: Decision) => d.refId || d.profileKey || d.keyPrefix;

  const selectableIds = useMemo(
    () => (result?.decisions ?? []).filter((d) => !!d.refId).map((d) => d.refId as string),
    [result],
  );

  useEffect(() => {
    // Default-select rows the backend flagged as willDelete after a scan.
    if (result && result.dry_run) {
      const next = new Set<string>();
      for (const d of result.decisions) if (d.willDelete && d.refId) next.add(d.refId);
      setSelected(next);
    }
  }, [result]);

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const run = async (dryRun: boolean) => {
    if (!dryRun) {
      if (selected.size === 0) {
        toast.error('בחר לפחות פרופיל אחד למחיקה');
        return;
      }
      if (!confirm(`למחוק לצמיתות ${selected.size} פרופילים מ-Ayrshare? פעולה בלתי הפיכה.`)) return;
    }
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-profiles-purge', {
        body: {
          dry_run: dryRun,
          include_orphans: includeOrphans,
          force_delete_all: forceDeleteAll,
          allow_active_profile_delete: forceDeleteAll,
          ...(dryRun ? {} : { selected_ref_ids: Array.from(selected) }),
        },
      });
      if (error) throw error;
      setResult(data as Response);
      const r = data as Response;
      if (dryRun) {
        toast.success(`סריקה: ${r.targets_count} פרופילים מועמדים מתוך ${r.total_profiles}`);
      } else {
        toast.success(`נמחקו ${r.deleted_count}/${r.targets_count} פרופילים מ-Ayrshare`);
      }
    } catch (e) {
      toast.error(`שגיאה: ${(e as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-amber-500/40" dir="rtl">
      <div className="flex items-center gap-2 text-amber-600">
        <ShieldAlert className="h-4 w-4" />
        <h3 className="text-sm font-bold">ניקוי בכמות פרופילי Ayrshare</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        סורק את כל הפרופילים תחת מפתח ה-API הראשי. סמן ידנית את הפרופילים שברצונך
        למחוק לפי RefId, או השתמש בבחירה מרובה. הפרופיל הפעיל של סביבת העבודה
        מוגן אוטומטית (אלא אם הופעל מצב חירום).
      </p>

      <div className="flex items-center justify-between bg-muted/30 rounded-md p-2">
        <Label htmlFor="orphans" className="text-xs">כלול פרופילים יתומים (ללא חיבורים)</Label>
        <Switch id="orphans" checked={includeOrphans} onCheckedChange={setIncludeOrphans} />
      </div>

      <div className="flex items-center justify-between bg-destructive/10 rounded-md p-2 border border-destructive/30">
        <Label htmlFor="force-all" className="text-xs text-destructive">מצב חירום: אפשר מחיקה גם של פרופיל מוגן/פעיל</Label>
        <Switch id="force-all" checked={forceDeleteAll} onCheckedChange={setForceDeleteAll} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={working} onClick={() => run(true)}>
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'סרוק (Dry-Run)'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          disabled={working || selected.size === 0}
          onClick={() => run(false)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          מחק את הנבחרים ({selected.size})
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            סה״כ: <b>{result.total_profiles}</b> · מועמדים מהסריקה: <b>{result.targets_count}</b>
            · נבחרו: <b>{selected.size}</b>
            {!result.dry_run && <> · נמחקו: <b>{result.deleted_count}</b></>}
            {result.protected_keys.length > 0 && (
              <> · מוגנים: {result.protected_keys.join(', ')}</>
            )}
          </div>
          <div className="max-h-72 overflow-auto border rounded-md">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="p-1.5 w-8 text-center">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="בחר הכל"
                    />
                  </th>
                  <th className="text-right p-1.5">Key</th>
                  <th className="text-right p-1.5">RefId / כותרת</th>
                  <th className="text-right p-1.5">חיבורים</th>
                  <th className="text-right p-1.5">סטטוס</th>
                  <th className="text-right p-1.5">סיבה</th>
                  <th className="text-right p-1.5">תוצאה</th>
                </tr>
              </thead>
              <tbody>
                {result.decisions.map((d) => {
                  const id = rowId(d);
                  const checkable = !!d.refId;
                  const checked = d.refId ? selected.has(d.refId) : false;
                  return (
                    <tr key={id} className={checked ? 'bg-destructive/10' : ''}>
                      <td className="p-1.5 text-center">
                        <Checkbox
                          checked={checked}
                          disabled={!checkable}
                          onCheckedChange={() => d.refId && toggleOne(d.refId)}
                          aria-label={`בחר ${id}`}
                        />
                      </td>
                      <td className="p-1.5 font-mono">{d.keyPrefix}…</td>
                      <td className="p-1.5 font-mono" title={d.refId ?? d.title ?? ''}>
                        {d.refId ? `${d.refId.slice(0, 12)}…` : (d.title ?? '-')}
                      </td>
                      <td className="p-1.5">{d.linkedCount > 0 ? d.linked.join(', ') : '—'}</td>
                      <td className="p-1.5">{d.suspended ? 'suspended' : d.userStatus || '?'}</td>
                      <td className="p-1.5">{d.reason ?? 'keep'}</td>
                      <td className="p-1.5">
                        {d.deleted == null ? '—' : d.deleted.ok ? '✓ נמחק' : `✗ ${d.deleted.status}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
