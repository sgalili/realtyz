import { useEffect, useMemo, useRef, useState } from 'react';
import { Chrome, Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useExtensionGroups, type ExtensionGroup } from '@/lib/extensionGroupBridge';

const FB_GROUPS_URL = 'https://www.facebook.com/groups/joins/?nav_source=tab';

/**
 * ExtensionGroupSyncCard — restores the companion-extension group sync flow.
 *
 * The extension pushes the broker's real Facebook groups into the page (see
 * `extensionGroupBridge`); this card persists them into `fb_user_groups` so the
 * publishing selectors read them like any other target, bypassing the Meta
 * Graph group permission restrictions.
 */
export function ExtensionGroupSyncCard({
  className,
  onSynced,
}: {
  className?: string;
  onSynced?: () => void;
}) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { groups, lastSyncAt, refresh } = useExtensionGroups();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const savedRef = useRef<string>('');

  const signature = useMemo(() => groups.map((g) => g.group_id).sort().join('|'), [groups]);

  const persist = async (rows: ExtensionGroup[], silent: boolean) => {
    if (!workspaceOwnerId || rows.length === 0) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase as any).from('fb_user_groups').upsert(
        rows.map((g) => ({
          workspace_owner_id: workspaceOwnerId,
          group_id: g.group_id,
          group_name: g.group_name,
          group_icon: g.group_icon,
          group_url: g.group_url,
          is_selected: true,
          imported_at: now,
          updated_at: now,
        })),
        { onConflict: 'workspace_owner_id,group_id' },
      );
      if (error) throw error;
      if (!silent) toast.success(`סונכרנו ${rows.length} קבוצות מהתוסף`);
      onSynced?.();
    } catch (e: any) {
      toast.error('שמירת הקבוצות מהתוסף נכשלה', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  // Auto-save every fresh push from the extension exactly once.
  useEffect(() => {
    if (!signature || signature === savedRef.current) return;
    savedRef.current = signature;
    void persist(groups, false);
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, workspaceOwnerId]);

  return (
    <div dir="rtl" className={cn('rounded-xl border border-border bg-background p-3 space-y-2 text-right', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Chrome className="h-4 w-4 text-primary" /> סנכרון קבוצות מהתוסף
        </span>
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {groups.length > 0
          ? `זוהו ${groups.length} קבוצות מהתוסף${lastSyncAt ? ` · עודכן ${new Date(lastSyncAt).toLocaleTimeString('he-IL')}` : ''}.`
          : 'התוסף מייבא את הקבוצות שלך ישירות מהחשבון, בלי הרשאות Meta לקבוצות.'}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
          <Users className="h-3.5 w-3.5" /> סנכרן קבוצות
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => { refresh(); toast.info('נשלחה בקשת סנכרון לתוסף'); }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> רענון מהתוסף
        </Button>
        {groups.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={saving}
            onClick={() => void persist(groups, false)}
          >
            שמור מחדש למערכת
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>סנכרון קבוצות פייסבוק דרך התוסף</DialogTitle>
            <DialogDescription>
              ודא שתוסף Realtyz מותקן ופעיל בדפדפן, ואז פתח את עמוד הקבוצות שלך בפייסבוק. התוסף יאסוף את הקבוצות
              והמערכת תשמור אותן אוטומטית כאן.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
            <li>ודא שהתוסף פעיל (סמל Realtyz בסרגל הדפדפן).</li>
            <li>פתח את עמוד הקבוצות בפייסבוק בלשונית חדשה.</li>
            <li>גלול עד סוף רשימת הקבוצות וחזור לכאן — הרשימה תתעדכן לבד.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { window.open(FB_GROUPS_URL, '_blank', 'noopener,noreferrer'); refresh(); }}
            >
              פתח את עמוד הקבוצות בפייסבוק
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => refresh()}>
              בדוק שוב
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExtensionGroupSyncCard;
