import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Attachment = { id: string; file_name: string; size_bytes: number | null; created_at: string };
const MAX = 20 * 1024 * 1024;

/** Super Admin attachment chooser: upload a new file or pick one from the shared library. */
export function InvitationAttachmentPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const list = useQuery({ queryKey: ['invitation-attachments'], queryFn: async () => {
    const { data, error } = await supabase.from('invitation_attachments').select('id,file_name,size_bytes,created_at').order('created_at', { ascending: false }).limit(200);
    if (error) throw error; return (data ?? []) as Attachment[];
  } });
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
      onChange(data.id); toast.success('הקובץ הועלה וצורף');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'העלאת הקובץ נכשלה'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const selected = list.data?.find(a => a.id === value);
  return <div className="space-y-2 rounded-md border border-dashed p-3">
    <div className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4" />צירוף קובץ</div>
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}
      className={`flex flex-wrap items-center gap-2 rounded-md p-2 ${drag ? 'bg-accent' : ''}`}>
      <input ref={input} type="file" className="hidden" onChange={e => void upload(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}צרף קובץ</Button>
      <span className="text-xs text-muted-foreground">או גררו קובץ לכאן</span>
    </div>
    <div className="flex items-center gap-2">
      <Select value={value ?? ''} onValueChange={v => onChange(v || null)}>
        <SelectTrigger aria-label="בחירת קובץ שהועלה בעבר" className="h-10 flex-1"><SelectValue placeholder={list.data?.length ? 'בחירה מקבצים קודמים' : 'אין קבצים קודמים'} /></SelectTrigger>
        <SelectContent dir="rtl">{list.data?.map(a => <SelectItem key={a.id} value={a.id}>{a.file_name}</SelectItem>)}</SelectContent>
      </Select>
      {value && <Button type="button" size="icon" variant="ghost" aria-label="הסרת הקובץ המצורף" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button>}
    </div>
    {selected && <p className="text-xs text-muted-foreground">מצורף: {selected.file_name}</p>}
  </div>;
}
