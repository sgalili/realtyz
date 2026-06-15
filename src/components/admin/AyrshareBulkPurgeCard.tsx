import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Decision = {
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

/**
 * Admin-only BULK purge of suspended / inactive / orphan Ayrshare profiles.
 * Lists every profile under the primary API key, classifies them, and on
 * "Execute" issues DELETE /api/profiles/profile for each target + clears local
 * workspace_social_profile rows that referenced the purged keys.
 */
export function AyrshareBulkPurgeCard() {
  const [includeOrphans, setIncludeOrphans] = useState(true);
  const [forceDeleteAll, setForceDeleteAll] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<Response | null>(null);

  const run = async (dryRun: boolean) => {
    if (!dryRun) {
      const targets = forceDeleteAll ? (result?.total_profiles ?? 0) : (result?.decisions.filter((d) => d.willDelete).length ?? 0);
      if (!confirm(`למחוק לצמיתות ${targets} פרופילים מ-Ayrshare? פעולה בלתי הפיכה.`)) return;
    }
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-profiles-purge', {
        body: {
          dry_run: dryRun,
          include_orphans: includeOrphans,
          force_delete_all: forceDeleteAll,
          allow_active_profile_delete: forceDeleteAll,
        },
      });
      if (error) throw error;
      setResult(data as Response);
      const r = data as Response;
      if (dryRun) {
        toast.success(`סריקה: ${r.targets_count} פרופילים מועמדים למחיקה מתוך ${r.total_profiles}`);
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
        סורק את כל הפרופילים תחת מפתח ה-API הראשי, מסמן פרופילים מושעים / לא פעילים /
        ללא חיבורים, ומוחק אותם מ-Ayrshare + מסנכרן את הטבלאות המקומיות. הפרופיל
        הפעיל של סביבת העבודה מוגן אוטומטית.
      </p>

      <div className="flex items-center justify-between bg-muted/30 rounded-md p-2">
        <Label htmlFor="orphans" className="text-xs">כלול פרופילים יתומים (ללא חיבורים)</Label>
        <Switch id="orphans" checked={includeOrphans} onCheckedChange={setIncludeOrphans} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={working} onClick={() => run(true)}>
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'סרוק (Dry-Run)'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          disabled={working || !result || result.targets_count === 0}
          onClick={() => run(false)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          מחק את כל המועמדים
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            סה״כ: <b>{result.total_profiles}</b> · מועמדים למחיקה: <b>{result.targets_count}</b>
            {!result.dry_run && <> · נמחקו: <b>{result.deleted_count}</b></>}
            {result.protected_keys.length > 0 && (
              <> · מוגנים: {result.protected_keys.join(', ')}</>
            )}
          </div>
          <div className="max-h-72 overflow-auto border rounded-md">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-right p-1.5">Key</th>
                  <th className="text-right p-1.5">Title / Ref</th>
                  <th className="text-right p-1.5">חיבורים</th>
                  <th className="text-right p-1.5">סטטוס</th>
                  <th className="text-right p-1.5">סיבה</th>
                  <th className="text-right p-1.5">תוצאה</th>
                </tr>
              </thead>
              <tbody>
                {result.decisions.map((d) => (
                  <tr key={d.keyPrefix + (d.refId ?? '')} className={d.willDelete ? 'bg-destructive/10' : ''}>
                    <td className="p-1.5 font-mono">{d.keyPrefix}…</td>
                    <td className="p-1.5">{d.title ?? d.refId ?? '-'}</td>
                    <td className="p-1.5">{d.linkedCount > 0 ? d.linked.join(', ') : '—'}</td>
                    <td className="p-1.5">{d.suspended ? 'suspended' : d.userStatus || '?'}</td>
                    <td className="p-1.5">{d.reason ?? 'keep'}</td>
                    <td className="p-1.5">
                      {d.deleted == null ? (d.willDelete ? 'ממתין' : '—') : d.deleted.ok ? '✓ נמחק' : `✗ ${d.deleted.status}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
