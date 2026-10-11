import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { normalizePhoneForStorage } from '@/lib/formatPhone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { developerImportUrl } from '@/lib/developerImportUrl';

type ImportedProject = {
  source_project_id: string | null; name: string; city: string | null; neighborhood: string | null;
  address: string | null; total_units: number | null; available_units: number | null; price_from: number | null;
  delivery_date: string | null; status: string | null; description: string | null; images: string[];
  source_url: string | null; apartments: unknown[]; source_details: Record<string, unknown>;
};
type Preview = { source_url: string; developer: { company_name: string | null; phone: string | null; logo_url: string | null }; projects: ImportedProject[]; warnings?: string[] };

const YAD2_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i;
const STAGES = ['מתחבר לעמוד היזם ביד2', 'קורא את פרטי החברה', 'אוסף את רשימת הפרויקטים', 'סופר יחידות דיור ודירות', 'מכין דוח סיכום'];

/** Animated staged loader shown while the Yad2 page is being read. */
function ImportProgress() {
  const [pct, setPct] = useState(4);
  useEffect(() => {
    const t = window.setInterval(() => setPct((p) => (p < 92 ? p + Math.max(1, (92 - p) / 14) : p)), 400);
    return () => window.clearInterval(t);
  }, []);
  const stage = Math.min(STAGES.length - 1, Math.floor((pct / 100) * STAGES.length));
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-lg border bg-card p-4">
      <Progress value={pct} className="h-2" />
      <ul className="space-y-1.5 text-sm">
        {STAGES.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i > stage ? 'text-muted-foreground/50' : i === stage ? 'font-semibold' : 'text-muted-foreground'}`}>
            {i < stage ? <CheckCircle2 className="h-4 w-4 text-primary" /> : i === stage ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="h-4 w-4 rounded-full border" />}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Paste a Yad2 developer page, preview every project/apartment, then save on confirm. */
export function DeveloperYad2Import({ onSaved, initialUrl }: { onSaved?: (summary: { projects: number; units: number }) => void; initialUrl?: string | null }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');

  const fetchPreview = async (value: string) => {
    if (loading) return;
    const clean = developerImportUrl(value);
    if (!clean) { setError('הדביקו את הקישור לעמוד הראשי של היזם ביד2, ולא למודעה או לפרויקט בודד'); return; }
    setUrl(clean);
    setLoading(true); setError(''); setBlocked(false); setPreview(null);
    const { data, error: fnError } = await supabase.functions.invoke('yad2-developer-import', { body: { url: clean } });
    setLoading(false);
    if (fnError || !data?.ok) {
      let msg = 'הייבוא נכשל. אפשר להמשיך ולהוסיף פרויקטים ידנית.';
      try { const b = await (fnError as any)?.context?.json?.(); if (b?.message) msg = b.message; } catch { /* keep default */ }
      const status = (fnError as any)?.context?.status;
      if (status === 502 || status === 503 || status === 429 || !data) setBlocked(true);
      setError(data?.message ?? msg);
      return;
    }
    if (!Array.isArray(data.projects) || data.projects.length === 0) { setBlocked(true); return; }
    setPreview(data as Preview);
  };

  const sum = (k: 'total_units' | 'available_units') => (preview?.projects ?? []).reduce((s, p) => s + (p[k] ?? 0), 0);
  const apartments = (preview?.projects ?? []).reduce((s, p) => s + (p.apartments?.length ?? 0), 0);
  const cities = [...new Set((preview?.projects ?? []).map((p) => p.city).filter(Boolean))] as string[];

  const save = async () => {
    if (!preview || !user) return;
    const ws = activeWorkspaceId ?? user.id;
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase.from('developers').select('id,company_name,phone,logo_url,first_project_name,first_project_units').eq('workspace_owner_id', ws).eq('source_url', preview.source_url).maybeSingle();
      if (existingError) throw existingError;
      const first = preview.projects[0];
      const devRow = {
        workspace_owner_id: ws,
        owner_user_id: user.id,
        company_name: preview.developer.company_name || existing?.company_name || 'החברה שלי',
        phone: preview.developer.phone ? normalizePhoneForStorage(preview.developer.phone) : existing?.phone ?? null,
        logo_url: preview.developer.logo_url ?? existing?.logo_url ?? null,
        source_url: preview.source_url,
        first_project_name: first?.name ?? existing?.first_project_name ?? null,
        first_project_units: first?.total_units ?? existing?.first_project_units ?? null,
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
        if (!devId) throw new Error('שמירת החברה לא הושלמה');
        const { data: savedProjects, error: readError } = await supabase.from('developer_projects').select('*').eq('workspace_owner_id', ws).eq('developer_id', devId);
        if (readError) throw readError;
        const rows = preview.projects.map((p) => {
          const old = savedProjects?.find(row => row.source_project_id === (p.source_project_id ?? p.source_url ?? p.name));
          const imported = {
          workspace_owner_id: ws, developer_id: devId, name: p.name, city: p.city, neighborhood: p.neighborhood,
          address: p.address, total_units: p.total_units, available_units: p.available_units, price_from: p.price_from,
          delivery_date: p.delivery_date, description: p.description, image_url: p.images[0] ?? null,
          images: p.images.length ? p.images : old?.images ?? [], apartments: p.apartments.length ? p.apartments as any : old?.apartments ?? [], source_url: p.source_url,
          source_details: p.source_details as any,
          source_project_id: p.source_project_id ?? p.source_url ?? p.name, status: old?.status ?? 'marketing',
          };
          // Partial source reads must not erase previously saved project details.
          return Object.fromEntries(Object.entries(imported).map(([key, value]) => [key, value ?? (old as Record<string, unknown> | undefined)?.[key] ?? null])) as typeof imported;
        });
        const { error: e } = await supabase.from('developer_projects').upsert(rows, { onConflict: 'developer_id,source_project_id' });
        if (e) throw e;
      }
      const summary = { projects: preview.projects.length, units: sum('total_units') };
      toast.success(`נשמרו ${summary.projects} פרויקטים`);
      setPreview(null); setUrl('');
      onSaved?.(summary);
    } catch (e: any) {
      toast.error(e?.message ?? 'השמירה נכשלה');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="dev-yad2-url" className="text-base font-bold">הקישור לעמוד הראשי של היזם ביד2</Label>
      <p id="dev-yad2-help" className="text-base text-muted-foreground">עמוד החברה, עם כל הפרויקטים.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="dev-yad2-url" aria-describedby="dev-yad2-help" dir="ltr" type="url" placeholder="https://www.yad2.co.il/yad1/developers/..." value={url} disabled={loading || saving}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData('text').trim(); if (YAD2_RE.test(t)) { e.preventDefault(); setUrl(t.match(YAD2_RE)?.[0] ?? t); setError(''); } }} />
        <Button type="button" onClick={() => void fetchPreview(url)} disabled={loading || saving || !url.trim()}>ייבוא כל הפרויקטים</Button>
      </div>
      {loading && <ImportProgress />}
      {!loading && (blocked || error) && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">{blocked ? 'הייבוא נתקל בהגנה זמנית מיד2, נסה שוב בעוד מספר דקות' : error}</p>
          {developerImportUrl(url) && <Button type="button" size="sm" variant="outline" onClick={() => void fetchPreview(url)}>נסה שוב</Button>}
        </div>
      )}
      {preview && (
        <div className="space-y-3 rounded-lg border bg-card p-3 animate-in fade-in">
          {preview.warnings?.map(warning => <p role="status" key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
          <div className="flex items-center gap-3">
            {preview.developer.logo_url && <img src={preview.developer.logo_url} alt="" className="h-10 w-10 rounded object-contain" />}
            <div>
              <div className="font-bold">{preview.developer.company_name ?? 'שם החברה לא נמצא'}</div>
              {cities.length > 0 && <div className="text-xs text-muted-foreground">{cities.join(' · ')}</div>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['פרויקטים', preview.projects.length], ['יח״ד', sum('total_units')], ['זמינות', sum('available_units')], ['דירות', apartments]] as const)
              .filter(([, v]) => v > 0)
              .map(([l, v]) => (
                <div key={l} className="rounded-md border p-2 text-center">
                  <div className="text-xl font-bold">{v.toLocaleString('he-IL')}</div>
                  <div className="text-xs text-muted-foreground">{l}</div>
                </div>
              ))}
          </div>
          {preview.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נמצאו פרויקטים בעמוד. אפשר לשמור את החברה ולהוסיף פרויקטים ידנית.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {preview.projects.map((p) => (
                <li key={p.source_project_id ?? p.name} className="rounded border p-2">
                  <div className="flex items-center gap-3">
                  {p.images[0] ? <img src={p.images[0]} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <div className="h-12 w-12 shrink-0 rounded bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[p.city, p.neighborhood].filter(Boolean).join(' · ')}
                      {p.total_units ? ` · ${p.total_units} יח״ד` : ''}
                      {p.available_units ? ` · ${p.available_units} זמינות` : ''}
                      {p.apartments.length ? ` · ${p.apartments.length} דירות` : ''}
                    </div>
                  </div>
                  </div>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-semibold">פרטי הפרויקט והדירות</summary>
                    {p.description && <p className="mt-2 whitespace-pre-line">{p.description}</p>}
                    <p className="mt-2">{[p.address, p.delivery_date, p.status].filter(Boolean).join(' · ')}</p>
                    <div className="mt-2 flex gap-2 overflow-x-auto">{p.images.map(image => <img key={image} src={image} alt={p.name} className="h-24 w-32 shrink-0 rounded object-cover" />)}</div>
                    {p.apartments.map((unit, index) => {
                      const u = unit as { source_unit_id?: string; rooms?: number; floor?: string; size_sqm?: number; price?: number; images?: string[] };
                      return <div key={u.source_unit_id ?? index} className="border-b py-2">
                        <div>{[u.rooms != null ? `${u.rooms} חדרים` : '', u.floor != null ? `קומה ${u.floor}` : '', u.size_sqm != null ? `${u.size_sqm} מ״ר` : ''].filter(Boolean).join(' · ')}{u.price != null && <strong> · ₪{u.price.toLocaleString('he-IL')}</strong>}</div>
                        {!!u.images?.length && <div className="mt-1 flex gap-2 overflow-x-auto">{u.images.map(image => <img key={image} src={image} alt="תמונת הדירה" className="h-20 w-28 shrink-0 rounded object-cover" />)}</div>}
                      </div>;
                    })}
                  </details>
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
