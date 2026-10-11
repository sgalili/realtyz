import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { normalizePhoneForStorage } from '@/lib/formatPhone';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import { asRecord, newUnit, projectForm, projectPayload, PROJECT_STATUS, PROJECT_STEPS, validateProjectStep, type DeveloperCompany, type DeveloperProject, type ProjectForm } from '@/lib/developerProjectForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AMENITIES = ['מעלית', 'חניה', 'מחסן', 'מרפסת', 'ממ״ד', 'לובי', 'חדר כושר', 'נגישות', 'גינה משותפת', 'טעינה לרכב חשמלי'];
type Props = { project?: DeveloperProject; company?: DeveloperCompany | null; onSaved: () => void; onCancel: () => void };

export default function DeveloperProjectWizard({ project, company, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [form, setForm] = useState(() => projectForm(project, company));
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => setForm(old => ({ ...old, [key]: value }));
  const field = (key: keyof Omit<ProjectForm, 'units' | 'images' | 'amenities'>, label: string, numeric = false) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={`project-${key}`} className="text-base font-semibold">{label}</Label>
      <Input id={`project-${key}`} className="h-11 text-base" value={form[key]} inputMode={numeric ? 'decimal' : undefined}
        dir={key.includes('url') || key === 'phone' ? 'ltr' : undefined} onChange={e => set(key, e.target.value)} />
    </div>
  );
  const go = (next: number) => {
    if (next > step) { const message = validateProjectStep(form, step); if (message) { setError(message); return; } }
    setError(''); setStep(next); setFurthest(old => Math.max(old, next));
  };
  const upload = async (files: FileList | null) => {
    if (!files || !user || !activeWorkspaceId) return;
    const ws = activeWorkspaceId;
    setUploading(true); setError('');
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('יש לבחור תמונות עד 15MB');
        const media = await uploadMediaToLibrary({ userId: user.id, fileName: file.name, data: file, mimeType: file.type, source: 'developer-project', sourceMetadata: { workspace_owner_id: ws } });
        setForm(old => ({ ...old, images: [...new Set([...old.images, media.public_url])] }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'העלאת התמונה נכשלה'); }
    finally { setUploading(false); }
  };
  const save = async () => {
    if (!user || !activeWorkspaceId || (project && project.workspace_owner_id !== activeWorkspaceId)) { setError('יש לבחור סביבת עבודה פעילה'); return; }
    for (let i = 0; i < 7; i++) { const message = validateProjectStep(form, i); if (message) { setStep(i); setError(message); return; } }
    const ws = activeWorkspaceId;
    setSaving(true); setError('');
    try {
      const companyRow = { company_name: form.company_name.trim(), phone: form.phone.trim() ? normalizePhoneForStorage(form.phone) : null, source_url: form.company_source_url.trim() || null, logo_url: form.logo_url.trim() || null };
      let developerId = company?.id;
      if (developerId) {
        const { data, error: e } = await supabase.from('developers').update(companyRow).eq('id', developerId).eq('workspace_owner_id', ws).select('id').single();
        if (e) throw e;
        developerId = data.id;
      } else {
        const { data, error: e } = await supabase.from('developers').insert({ ...companyRow, workspace_owner_id: ws, owner_user_id: user.id, first_project_name: form.name.trim(), first_project_units: projectPayload(form).total_units }).select('id').single();
        if (e) throw e;
        developerId = data.id;
      }
      const payload = projectPayload(form, project);
      const row = { ...payload, apartments: payload.apartments as Json, source_details: payload.source_details as Json };
      const result = project
        ? await supabase.from('developer_projects').update(row).eq('id', project.id).eq('workspace_owner_id', ws).select('id').single()
        : await supabase.from('developer_projects').insert({ ...row, developer_id: developerId, workspace_owner_id: ws }).select('id').single();
      if (result.error) throw result.error;
      toast.success('הפרויקט נשמר'); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : asRecord(e).message as string || 'השמירה נכשלה'); }
    finally { setSaving(false); }
  };

  return <div className="flex min-h-0 flex-col gap-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-bold">{PROJECT_STEPS[step]}</h2>
      <span className="shrink-0 text-base text-muted-foreground">{step + 1} / 8</span>
    </div>
    <Progress value={(step + 1) / 8 * 100} className="h-1.5" />
    <nav aria-label="שלבי הפרויקט" className="flex justify-between gap-1">
      {PROJECT_STEPS.map((label, i) => <Button key={label} size="icon-sm" variant={i === step ? 'default' : 'ghost'} disabled={i > furthest || saving || uploading}
        aria-label={`${i + 1}. ${label}`} aria-current={i === step ? 'step' : undefined} title={label} onClick={() => go(i)}>
        {i < step ? <Check className="h-4 w-4" /> : i + 1}
      </Button>)}
    </nav>
    <div className="max-h-[48dvh] min-h-48 space-y-4 overflow-y-auto px-1 pb-2">
      {step === 0 && <>{field('company_name', 'שם החברה *')}{field('phone', 'טלפון החברה')}{field('company_source_url', 'עמוד החברה ביד2')}{field('logo_url', 'קישור ללוגו')}</>}
      {step === 1 && <>{field('name', 'שם הפרויקט *')}<div className="space-y-2"><Label htmlFor="project-description" className="text-base">תיאור הפרויקט</Label><Textarea id="project-description" className="min-h-28 text-base" value={form.description} onChange={e => set('description', e.target.value)} /></div>{field('source_url', 'קישור לפרויקט ביד2')}</>}
      {step === 2 && <>{field('city', 'עיר')}{field('neighborhood', 'שכונה')}{field('address', 'כתובת')}</>}
      {step === 3 && <>
        <div className="space-y-2"><Label className="text-base" htmlFor="project-status">שלב הפרויקט</Label><Select value={form.status} onValueChange={v => set('status', v)}><SelectTrigger id="project-status" className="h-11 text-base"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3">{field('total_units', 'סך יחידות דיור', true)}{field('available_units', 'יחידות זמינות', true)}</div>
        {field('price_from', 'מחיר החל מ־₪', true)}{field('delivery_date', 'מועד מסירה')}
      </>}
      {step === 4 && <>
        {form.units.map((u, i) => <fieldset key={u.source_unit_id} className="space-y-3 border-b border-border pb-4">
          <div className="flex items-center justify-between"><legend className="text-lg font-semibold">דגם {i + 1}</legend><Button size="icon-sm" variant="ghost" title="מחיקת דגם" aria-label={`מחיקת דגם ${i + 1}`} onClick={() => set('units', form.units.filter((_, index) => index !== i))}><Trash2 /></Button></div>
          <div className="grid grid-cols-2 gap-3">{([['type', 'סוג דירה'], ['rooms', 'חדרים'], ['floor', 'קומה'], ['size_sqm', 'שטח במ״ר'], ['price', 'מחיר ₪'], ['count', 'מספר יחידות'], ['balcony_sqm', 'מרפסת במ״ר'], ['parking', 'חניות']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`unit-${i}-${key}`} className="text-base">{label}</Label><Input id={`unit-${i}-${key}`} className="h-11 text-base" value={u[key]} inputMode={key === 'type' || key === 'floor' ? undefined : 'decimal'} onChange={e => set('units', form.units.map((unit, index) => index === i ? { ...unit, [key]: e.target.value } : unit))} /></div>)}</div>
        </fieldset>)}
        <Button variant="outline" onClick={() => set('units', [...form.units, newUnit()])}><Plus />הוספת דגם דירה</Button>
      </>}
      {step === 5 && <>
        <Label htmlFor="project-images" className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-base font-semibold">{uploading ? <Loader2 className="animate-spin" /> : <Upload />}העלאת תמונות</Label>
        <Input id="project-images" type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
        <div className="flex gap-2"><Input aria-label="קישור לתמונה" dir="ltr" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://" /><Button size="icon" variant="outline" aria-label="הוספת תמונה מקישור" title="הוספת תמונה מקישור" onClick={() => { try { if (new URL(imageUrl).protocol !== 'https:') throw new Error(); set('images', [...new Set([...form.images, imageUrl])]); setImageUrl(''); setError(''); } catch { setError('יש להזין קישור תמונה תקין'); } }}><Plus /></Button></div>
        <div className="grid grid-cols-2 gap-3">{form.images.map((image, i) => <div key={image} className="space-y-1"><img src={image} alt={`תמונת פרויקט ${i + 1}`} className="aspect-[4/3] w-full rounded-md object-cover" /><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{i === 0 ? 'תמונה ראשית' : i + 1}</span><div className="flex"><Button size="icon-sm" variant="ghost" disabled={i === 0} title="הקדמת תמונה" aria-label={`הקדמת תמונה ${i + 1}`} onClick={() => { const images = [...form.images]; [images[i - 1], images[i]] = [images[i], images[i - 1]]; set('images', images); }}><ArrowRight /></Button><Button size="icon-sm" variant="ghost" title="הסרת תמונה" aria-label={`הסרת תמונה ${i + 1}`} onClick={() => set('images', form.images.filter(v => v !== image))}><Trash2 /></Button></div></div></div>)}</div>
      </>}
      {step === 6 && <>
        <div className="space-y-2"><Label htmlFor="project-specifications" className="text-base">מפרט הפרויקט</Label><Textarea id="project-specifications" className="min-h-28 text-base" value={form.specifications} onChange={e => set('specifications', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">{AMENITIES.map(a => <Label key={a} className="flex items-center gap-2 text-base"><Checkbox checked={form.amenities.includes(a)} onCheckedChange={checked => set('amenities', checked === true ? [...form.amenities, a] : form.amenities.filter(v => v !== a))} />{a}</Label>)}</div>
      </>}
      {step === 7 && <>
        {form.images[0] && <img src={form.images[0]} alt={form.name} className="aspect-[16/7] w-full rounded-md object-cover" />}
        <h3 className="text-2xl font-bold">{form.name}</h3><p className="text-lg">{form.company_name}</p>
        <dl className="divide-y divide-border text-base">{[
          ['מיקום', [form.city, form.neighborhood, form.address].filter(Boolean).join(' · ')], ['שלב', PROJECT_STATUS[form.status] ?? form.status],
          ['יחידות דיור', form.total_units], ['זמינות', form.available_units], ['מחיר החל מ־', form.price_from ? `₪${Number(form.price_from.replace(/,/g, '')).toLocaleString('he-IL')}` : ''],
          ['מסירה', form.delivery_date], ['דגמי דירות', form.units.length || ''], ['תמונות', form.images.length || ''], ['מפרט', form.specifications], ['מאפיינים', form.amenities.join(' · ')],
        ].filter(([, v]) => v !== '').map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-line font-semibold">{value}</dd></div>)}</dl>
        {form.description && <p className="whitespace-pre-line text-base">{form.description}</p>}
      </>}
    </div>
    {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      <Button variant="ghost" disabled={saving || uploading} onClick={() => step ? go(step - 1) : onCancel()}>{step ? <><ArrowRight />הקודם</> : 'ביטול'}</Button>
      {step < 7 ? <Button disabled={uploading} onClick={() => go(step + 1)}>הבא<ArrowLeft /></Button> : <Button disabled={saving || uploading} onClick={() => void save()}>{saving && <Loader2 className="animate-spin" />}אישור ושמירה</Button>}
    </div>
  </div>;
}