import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { normalizePhoneForStorage } from '@/lib/formatPhone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ImportedProject = {
  source_project_id: string | null; name: string; city: string | null; neighborhood: string | null;
  address: string | null; total_units: number | null; available_units: number | null; price_from: number | null;
  delivery_date: string | null; status: string | null; description: string | null; images: string[];
  source_url: string | null; apartments: unknown[];
};
type Preview = { source_url: string; developer: { company_name: string | null; phone: string | null; logo_url: string | null }; projects: ImportedProject[] };

const YAD2_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i;

/** Paste a Yad2 developer page, preview every project/apartment, then save on confirm. */
export function DeveloperYad2Import({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');

  const fetchPreview = async (value: string) => {
    const clean = value.match(YAD2_RE)?.[0];
    if (!clean) { setError('הקישור אינו עמוד יד2 תקין'); return; }
    setLoading(true); setError(''); setPreview(null);
    const { data, error: fnError } = await supabase.functions.invoke('yad2-developer-import', { body: { url: clean } });
    setLoading(false);
    if (fnError || !data?.ok) {
      let msg = 'הייבוא נכשל. אפשר להמשיך ולהוסיף פרויקטים ידנית.';
      try { const b = await (fnError as any)?.context?.json?.(); if (b?.message) msg = b.message; } catch { /* keep default */ }
      setError(data?.message ?? msg);
      return;
    }
    setPreview(data as Preview);
  };

  const save = async () => {
    if (!preview || !user) return;
    const ws = activeWorkspaceId ?? user.id;
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('developers').select('id').eq('workspace_owner_id', ws).eq('source_url', preview.source_url).maybeSingle();
      const first = preview.projects[0];
      const devRow = {
        workspace_owner_id: ws,
        owner_user_id: user.id,
        company_name: preview.developer.company_name || 'החברה שלי',
        phone: preview.developer.phone ? normalizePhoneForStorage(preview.developer.phone) : null,
        logo_url: preview.developer.logo_url,
        source_url: preview.source_url,
        first_project_name: first?.name ?? null,
        first_project_units: first?.total_units ?? null,
        last_synced_at: new Date().toISOString(),
      };
      let devId = existing?.id as string | undefined;
      if (devId) {
        const { error: e } = await supabase.from('developers').update(devRow).eq('id', devId);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('developers').insert(devRow).select('id').single();
        if (e) throw e;
        devId = data.id;
      }
      if (preview.projects.length) {
        const rows = preview.projects.map((p) => ({
          workspace_owner_id: ws, developer_id: devId!, name: p.name, city: p.city, neighborhood: p.neighborhood,
          address: p.address, total_units: p.total_units, available_units: p.available_units, price_from: p.price_from,
          delivery_date: p.delivery_date, description: p.description, image_url: p.images[0] ?? null,
          images: p.images, apartments: p.apartments as any, source_url: p.source_url,
          source_project_id: p.source_project_id ?? p.name, status: 'marketing',
        }));
        const { error: e } = await supabase.from('developer_projects').upsert(rows, { onConflict: 'developer_id,source_project_id' });
        if (e) throw e;
      }
      toast.success(`נשמרו ${preview.projects.length} פרויקטים`);
      setPreview(null); setUrl('');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'השמירה נכשלה');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="dev-yad2-url">הדבק את כתובת ה-URL של עמוד היזם שלך ביד 2</Label>
      <div className="flex gap-2">
        <Input id="dev-yad2-url" dir="ltr" type="url" placeholder="https://www.yad2.co.il/yad1/developer/..." value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData('text').trim(); if (YAD2_RE.test(t)) { e.preventDefault(); setUrl(t); void fetchPreview(t); } }} />
        <Button type="button" onClick={() => void fetchPreview(url)} disabled={loading || !url.trim()}>ייבוא</Button>
      </div>
      {loading && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />טוען את הפרויקטים מיד2...</div>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {preview && (
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-3">
            {preview.developer.logo_url && <img src={preview.developer.logo_url} alt="" className="h-10 w-10 rounded object-contain" />}
            <div className="font-bold">{preview.developer.company_name ?? 'שם החברה לא נמצא'}</div>
          </div>
          {preview.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נמצאו פרויקטים בעמוד. אפשר לשמור את החברה ולהוסיף פרויקטים ידנית.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {preview.projects.map((p) => (
                <li key={p.source_project_id ?? p.name} className="flex items-center gap-3 rounded border p-2">
                  {p.images[0] ? <img src={p.images[0]} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <div className="h-12 w-12 shrink-0 rounded bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.city, p.neighborhood].filter(Boolean).join(' · ')}
                      {p.total_units ? ` · ${p.total_units} יח״ד` : ''}
                      {p.apartments.length ? ` · ${p.apartments.length} דירות` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}אישור ושמירה</Button>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>ביטול</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeveloperYad2Import;
