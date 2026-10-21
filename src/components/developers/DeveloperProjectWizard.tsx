import { useState } from 'react';
import BrokerageCommissionDisclosure from '@/components/public/BrokerageCommissionDisclosure';
import { ArrowRight, Loader2, Plus, Trash2, Upload } from 'lucide-react';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AMENITIES = ['מעלית', 'חניה', 'מחסן', 'מרפסת', 'ממ״ד', 'לובי', 'חדר כושר', 'נגישות', 'גינה משותפת', 'טעינה לרכב חשמלי'];
type Props = { project?: DeveloperProject; company?: DeveloperCompany | null; onSaved: () => void; onCancel: () => void };

export default function DeveloperProjectWizard({ project, company, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [form, setForm] = useState(() => projectForm(project, company));
  const [openStep, setOpenStep] = useState('step-0');
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
  const stepFilled = (i: number) => i === 7 ? form.name.trim() !== '' : !validateProjectStep(form, i);
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
    for (let i = 0; i < 7; i++) { const message = validateProjectStep(form, i); if (message) { setOpenStep(`step-${i}`); setError(message); return; } }
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

  const renderStep = (i: number) => <div className="space-y-4 pt-1">
    {i === 0 && <>{field('company_name', 'שם החברה *')}{field('phone', 'טלפון החברה')}{field('company_source_url', 'עמוד החברה ביד2')}{field('logo_url', 'קישור ללוגו')}</>}
    {i === 1 && <>{field('name', 'שם הפרויקט *')}<div className="space-y-2"><Label htmlFor="project-description" className="text-base">תיאור הפרויקט</Label><Textarea id="project-description" className="min-h-28 text-base" value={form.description} onChange={e => set('description', e.target.value)} /></div>{field('source_url', 'קישור לפרויקט ביד2')}</>}
    {i === 2 && <>{field('city', 'עיר')}{field('neighborhood', 'שכונה')}{field('address', 'כתובת')}</>}
    {i === 3 && <>
      <div className="space-y-2"><Label className="text-base" htmlFor="project-status">שלב הפרויקט</Label><Select value={form.status} onValueChange={v => set('status', v)}><SelectTrigger id="project-status" className="h-11 text-base"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PROJECT_STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">{field('total_units', 'סך יחידות דיור', true)}{field('available_units', 'יחידות זמינות', true)}</div>
      {field('price_from', 'מחיר החל מ־₪', true)}{field('delivery_date', 'מועד מסירה')}
    </>}
    {i === 4 && <>
      {form.units.map((u, idx) => <fieldset key={`${u.building_id ?? ''}:${u.source_unit_id}`} className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between"><legend className="text-lg font-semibold">{u.building_name ? `בניין ${u.building_name} · ` : ''}דגם {idx + 1}</legend><Button size="icon-sm" variant="ghost" title="מחיקת דגם" aria-label={`מחיקת דגם ${idx + 1}`} onClick={() => set('units', form.units.filter((_, index) => index !== idx))}><Trash2 /></Button></div>
        <div className="space-y-1"><Label htmlFor={`unit-${idx}-building`} className="text-base">בניין</Label><Input id={`unit-${idx}-building`} value={String(u.building_name ?? '')} onChange={event => set('units', form.units.map((unit, index) => index === idx ? { ...unit, building_name: event.target.value, building_id: event.target.value.trim() ? `manual:${event.target.value.trim()}` : null } : unit))} /></div>
        <div className="grid grid-cols-2 gap-3">{([['type', 'סוג דירה'], ['rooms', 'חדרים'], ['floor', 'קומה'], ['size_sqm', 'שטח במ״ר'], ['price', 'מחיר ₪'], ['count', 'מספר יחידות'], ['balcony_sqm', 'מרפסת במ״ר'], ['parking', 'חניות']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`unit-${idx}-${key}`} className="text-base">{label}</Label><Input id={`unit-${idx}-${key}`} className="h-11 text-base" value={u[key]} inputMode={key === 'type' || key === 'floor' ? undefined : 'decimal'} onChange={e => set('units', form.units.map((unit, index) => index === idx ? { ...unit, [key]: e.target.value } : unit))} /></div>)}</div>
      </fieldset>)}
      <Button variant="outline" onClick={() => set('units', [...form.units, newUnit()])}><Plus />הוספת דגם דירה</Button>
    </>}
    {i === 5 && <>
      <Label htmlFor="project-images" className="flex min-h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-base font-semibold">{uploading ? <Loader2 className="animate-spin" /> : <Upload />}העלאת תמונות</Label>
      <Input id="project-images" type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
      <div className="flex gap-2"><Input aria-label="קישור לתמונה" dir="ltr" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://" /><Button size="icon" variant="outline" aria-label="הוספת תמונה מקישור" title="הוספת תמונה מקישור" onClick={() => { try { if (new URL(imageUrl).protocol !== 'https:') throw new Error(); set('images', [...new Set([...form.images, imageUrl])]); setImageUrl(''); setError(''); } catch { setError('יש להזין קישור תמונה תקין'); } }}><Plus /></Button></div>
      <div className="grid grid-cols-2 gap-3">{form.images.map((image, idx) => <div key={image} className="space-y-1"><img src={image} alt={`תמונת פרויקט ${idx + 1}`} className="aspect-[4/3] w-full rounded-md object-cover" /><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{idx === 0 ? 'תמונה ראשית' : idx + 1}</span><div className="flex"><Button size="icon-sm" variant="ghost" disabled={idx === 0} title="הקדמת תמונה" aria-label={`הקדמת תמונה ${idx + 1}`} onClick={() => { const images = [...form.images]; [images[idx - 1], images[idx]] = [images[idx], images[idx - 1]]; set('images', images); }}><ArrowRight /></Button><Button size="icon-sm" variant="ghost" title="הסרת תמונה" aria-label={`הסרת תמונה ${idx + 1}`} onClick={() => set('images', form.images.filter(v => v !== image))}><Trash2 /></Button></div></div></div>)}</div>
    </>}
    {i === 6 && <>
      <div className="space-y-2"><Label htmlFor="project-specifications" className="text-base">מפרט הפרויקט</Label><Textarea id="project-specifications" className="min-h-28 text-base" value={form.specifications} onChange={e => set('specifications', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">{AMENITIES.map(a => <Label key={a} className="flex items-center gap-2 text-base"><Checkbox checked={form.amenities.includes(a)} onCheckedChange={checked => set('amenities', checked === true ? [...form.amenities, a] : form.amenities.filter(v => v !== a))} />{a}</Label>)}</div>
    </>}
    {i === 7 && <>
      {form.images[0] && <img src={form.images[0]} alt={form.name} className="aspect-[16/7] w-full rounded-md object-cover" />}
      <h3 className="text-2xl font-bold">{form.name}</h3><p className="text-lg">{form.company_name}</p>
      <dl className="divide-y divide-border text-base">{[
        ['מיקום', [form.city, form.neighborhood, form.address].filter(Boolean).join(' · ')], ['שלב', PROJECT_STATUS[form.status] ?? form.status],
        ['יחידות דיור', form.total_units], ['זמינות', form.available_units], ['מחיר החל מ־', form.price_from ? `₪${Number(form.price_from.replace(/,/g, '')).toLocaleString('he-IL')}` : ''],
        ['מסירה', form.delivery_date], ['דגמי דירות', form.units.length || ''], ['תמונות', form.images.length || ''], ['מפרט', form.specifications], ['מאפיינים', form.amenities.join(' · ')],
      ].filter(([, v]) => v !== '').map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-line font-semibold">{value}</dd></div>)}</dl>
      {form.description && <p className="whitespace-pre-line text-base">{form.description}</p>}
    </>}
  </div>;

  return <div className="flex min-h-0 flex-col gap-4">
    <BrokerageCommissionDisclosure audience="seller" />
    <Accordion type="single" collapsible value={openStep} onValueChange={setOpenStep} className="space-y-2">
      {PROJECT_STEPS.map((title, i) => (
        <AccordionItem key={title} value={`step-${i}`} className="rounded-md border bg-background">
          <AccordionTrigger className="gap-3 px-4 text-start hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${stepFilled(i) ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`} aria-label={`שלב ${i + 1} מתוך 8`}>{i + 1}</span>
              <span className="min-w-0 flex-1">{title}</span>
              <span className={`shrink-0 text-xs ${stepFilled(i) ? 'text-success' : 'text-muted-foreground'}`}>{stepFilled(i) ? 'הושלם' : <>חסרים פרטים<span className="text-destructive"> *</span></>}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4">{renderStep(i)}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
    {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
      <Button variant="ghost" disabled={saving || uploading} onClick={onCancel}>ביטול</Button>
      <Button disabled={saving || uploading} onClick={() => void save()} className="bg-success font-bold text-success-foreground hover:bg-success/90">{saving && <Loader2 className="animate-spin" />}אישור ושמירה</Button>
    </div>
  </div>;
}
