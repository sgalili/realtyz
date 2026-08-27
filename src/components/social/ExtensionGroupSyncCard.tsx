import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useExtensionGroups, readExtensionGroups, type ExtensionGroup } from '@/lib/extensionGroupBridge';
import { ExtensionDownloadButton } from '@/components/social/ExtensionDownloadButton';

const FB_GROUPS_URL = 'https://www.facebook.com/groups/joins/?nav_source=tab';

/**
 * ExtensionGroupSyncCard — companion-extension group sync.
 *
 * The extension pushes the broker's real Facebook groups into the page (see
 * `extensionGroupBridge`); this card persists them into `fb_user_groups` so the
 * publishing selectors read them like any other target.
 *
 * `actions` lets the parent render the connection action buttons in the very
 * same row as the sync buttons.
 */
export function ExtensionGroupSyncCard({
  className,
  onSynced,
  actions,
}: {
  className?: string;
  onSynced?: () => void;
  actions?: ReactNode;
}) {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { groups, refresh } = useExtensionGroups();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
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

  /** "בדוק שוב" — ask the extension, wait for the push, then persist + list. */
  const checkNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      refresh();
      let found: ExtensionGroup[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 400));
        found = readExtensionGroups();
        if (found.length > 0) break;
        if (i % 3 === 2) refresh();
      }
      if (found.length === 0) {
        toast.error('לא זוהו קבוצות מהתוסף', { description: 'פתח את עמוד הקבוצות בפייסבוק וגלול עד הסוף.' });
        return;
      }
      savedRef.current = found.map((g) => g.group_id).sort().join('|');
      await persist(found, false);
      setOpen(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div dir="rtl" className={cn('flex flex-wrap items-center gap-2 text-right', className)}>
      <Button type="button" size="sm" className="h-8 gap-1 text-[15px]" onClick={() => setOpen(true)} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} סנכרן קבוצות
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1 text-[15px]"
        disabled={checking}
        onClick={() => void checkNow()}
      >
        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} רענון
      </Button>
      <ExtensionDownloadButton />
      {actions}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="text-right sm:max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>סנכרון קבוצות פייסבוק דרך התוסף</DialogTitle>
            <DialogDescription>
              ודא שתוסף Realtyz מותקן ופעיל בדפדפן, ואז פתח את עמוד הקבוצות שלך בפייסבוק. התוסף יאסוף את הקבוצות
              והמערכת תשמור אותן אוטומטית כאן.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-inside list-decimal space-y-1 text-[15px] leading-relaxed text-muted-foreground">
            <li>ודא שהתוסף פעיל (סמל Realtyz בסרגל הדפדפן).</li>
            <li>פתח את עמוד הקבוצות בפייסבוק בלשונית חדשה.</li>
            <li>גלול עד סוף רשימת הקבוצות וחזור לכאן — הרשימה תתעדכן לבד.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-[15px]"
              onClick={() => { window.open(FB_GROUPS_URL, '_blank', 'noopener,noreferrer'); refresh(); }}
            >
              פתח את עמוד הקבוצות בפייסבוק
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[15px]"
              disabled={checking}
              onClick={() => void checkNow()}
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} בדוק שוב
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExtensionGroupSyncCard;
