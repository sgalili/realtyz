import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, ExternalLink, Users } from 'lucide-react';
import { toast } from 'sonner';

type CustomGroup = {
  id: string;
  group_name: string;
  group_url: string;
  platform: string;
  created_at: string;
};

export function CustomGroupsManager() {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!workspaceOwnerId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('custom_user_groups')
      .select('id, group_name, group_url, platform, created_at')
      .eq('workspace_owner_id', workspaceOwnerId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error('שגיאה בטעינת קבוצות');
      return;
    }
    setGroups((data ?? []) as CustomGroup[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspaceOwnerId]);

  const add = async () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) {
      toast.error('יש למלא שם וקישור');
      return;
    }
    if (!/^https?:\/\/(www\.)?facebook\.com\/groups\//i.test(trimmedUrl)) {
      toast.error('הקישור חייב להיות כתובת קבוצת פייסבוק (facebook.com/groups/…)');
      return;
    }
    if (!workspaceOwnerId) return;
    setSaving(true);
    const { error } = await (supabase as any).from('custom_user_groups').insert({
      workspace_owner_id: workspaceOwnerId,
      group_name: trimmedName,
      group_url: trimmedUrl,
      platform: 'facebook',
    });
    setSaving(false);
    if (error) {
      toast.error('שמירה נכשלה: ' + error.message);
      return;
    }
    setName('');
    setUrl('');
    toast.success('הקבוצה נוספה');
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from('custom_user_groups').delete().eq('id', id);
    if (error) {
      toast.error('מחיקה נכשלה: ' + error.message);
      return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <Users className="h-4 w-4" />
          ניהול קבוצות ידני / תוסף
        </h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {groups.length} קבוצות
        </span>
      </div>


      <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם הקבוצה (למשל: דירות להשכרה בהרצליה)"
          maxLength={120}
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.facebook.com/groups/..."
          dir="ltr"
          maxLength={500}
        />
        <Button onClick={add} disabled={saving} className="gap-1">
          <Plus className="h-4 w-4" />
          {saving ? 'שומר…' : 'הוסף קבוצה'}
        </Button>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {loading && <div className="px-3 py-4 text-center text-xs text-muted-foreground">טוען…</div>}
        {!loading && groups.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-muted-foreground">
            אין קבוצות שמורות. הוסף קבוצה בשדות שלמעלה או סנכרן דרך התוסף.
          </div>
        )}


        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40">
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-sm font-semibold text-foreground">{g.group_name}</div>
              <a
                href={g.group_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-primary"
                dir="ltr"
              >
                <ExternalLink className="h-3 w-3" />
                {g.group_url}
              </a>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(g.id)} aria-label="מחק קבוצה">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CustomGroupsManager;
