import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { SUMMARY_ROLES, type SummaryRole, defaultSummaryId } from '@/lib/invitationSummaries';

type Attachment = { id: string; file_name: string; size_bytes: number | null; created_at: string; summary_role: SummaryRole | null };
const MAX = 20 * 1024 * 1024;

/** Super Admin attachment chooser: one select (executive summaries by user type + other files), one upload action. */
export function InvitationAttachmentPicker({ value, onChange, recipientRole, compact = false }: { value: string | null; onChange: (id: string | null) => void; recipientRole?: SummaryRole | null; compact?: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const list = useQuery({ queryKey: ['invitation-attachments'], queryFn: async () => {
    const { data, error } = await supabase.from('invitation_attachments').select('id,file_name,size_bytes,created_at,summary_role').order('created_at', { ascending: false }).limit(200);
    if (error) throw error; return (data ?? []) as Attachment[];
  } });
  // Default: the executive summary matching the recipient's user type, until the admin changes the choice.
  useEffect(() => {
    if (touched.current || value || !list.data) return;
    const id = defaultSummaryId(list.data, recipientRole);
    if (id) onChange(id);
  }, [list.data, recipientRole, value, onChange]);
  const choose = (id: string | null) => { touched.current = true; onChange(id); };
  const upload = async (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX) { toast.error('הקובץ גדול מ-20MB'); return; }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('יש להתחבר מחדש');
      const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
      const path = `${crypto.randomUUID()}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage.from('invitation-attachments').upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from('invitation_attachments').insert({ storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, created_by: auth.user.id }).select('id').single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['invitation-attachments'] });
      choose(data.id); toast.success('הקובץ הועלה וצורף');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'העלאת הקובץ נכשלה'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const setSummaryRole = async (role: SummaryRole | 'none') => {
    if (!value) return;
    try {
      if (role !== 'none') { const { error } = await supabase.from('invitation_attachments').update({ summary_role: null }).eq('summary_role', role); if (error) throw error; }
      const { error } = await supabase.from('invitation_attachments').update({ summary_role: role === 'none' ? null : role }).eq('id', value);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['invitation-attachments'] });
      toast.success('השיוך נשמר');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שמירת השיוך נכשלה'); }
  };
  const files = list.data ?? [];
  const selected = files.find(a => a.id === value);
  const others = files.filter(a => !a.summary_role);
  return <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}
    className={compact ? `space-y-2 ${drag ? 'bg-accent' : ''}` : `space-y-2 rounded-md border border-dashed p-3 ${drag ? 'bg-accent' : ''}`}>
    <div className="flex items-center gap-2">
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select value={value ?? ''} onValueChange={v => { if (v === '__add_files') { input.current?.click(); return; } choose(v || null); }}>
        <SelectTrigger aria-label="קובץ מצורף" className="h-10 min-w-0 flex-1"><SelectValue placeholder="ללא קובץ מצורף" /></SelectTrigger>
        <SelectContent dir="rtl">
          <SelectGroup><SelectLabel>תקצירי מנהלים</SelectLabel>
            {SUMMARY_ROLES.map(r => { const f = files.find(a => a.summary_role === r.value); return f
              ? <SelectItem key={r.value} value={f.id}>תקציר {r.label} · {f.file_name}</SelectItem>
              : <SelectItem key={r.value} value={`missing-${r.value}`} disabled>תקציר {r.label} · טרם הועלה</SelectItem>; })}
          </SelectGroup>
          {others.length > 0 && <SelectGroup><SelectLabel>קבצים נוספים</SelectLabel>{others.map(a => <SelectItem key={a.id} value={a.id}>{a.file_name}</SelectItem>)}</SelectGroup>}
          {compact && <SelectItem value="__add_files" className="font-semibold text-primary">{busy ? 'מעלה קובץ...' : 'הוספת קבצים'}</SelectItem>}
        </SelectContent>
      </Select>
      {value && <Button type="button" size="icon" variant="ghost" aria-label="הסרת הקובץ המצורף" onClick={() => choose(null)}><X className="h-4 w-4" /></Button>}
      <input ref={input} type="file" className="hidden" onChange={e => void upload(e.target.files?.[0])} />
      {!compact && <Button type="button" size="icon" variant="outline" disabled={busy} aria-label="העלאת קובץ (אפשר גם לגרור לכאן)" title="העלאת קובץ (אפשר גם לגרור לכאן)" onClick={() => input.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</Button>}
    </div>
    {!compact && selected && <Select value={selected.summary_role ?? 'none'} onValueChange={v => void setSummaryRole(v as SummaryRole | 'none')}>
      <SelectTrigger aria-label="שיוך הקובץ כתקציר מנהלים" className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent dir="rtl"><SelectItem value="none">לא משמש כתקציר מנהלים</SelectItem>{SUMMARY_ROLES.map(r => <SelectItem key={r.value} value={r.value}>תקציר מנהלים עבור {r.label}</SelectItem>)}</SelectContent>
    </Select>}
  </div>;
}
