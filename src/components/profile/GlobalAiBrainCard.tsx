import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { brainTextDocumentName } from '@/lib/brainTextDocument';
import { BrainTabs, BrainUploadZone, BrainDocumentCard, BrainTextEntry, type BrainTab, type BrainDocument } from '@/components/ai-brain/BrainResources';
import { brainFileText } from '@/lib/brainFileText';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export function GlobalAiBrainCard() {
  const { isSuperAdmin, loading, error } = useUserRole();
  if (loading || error || !isSuperAdmin) return null;
  return <GlobalAiBrainContent />;
}

function GlobalAiBrainContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BrainTab>('files');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [intent, setIntent] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<BrainDocument | null>(null);
  const key = ['global-ai-documents', user?.id];
  const docs = useQuery({ queryKey: key, enabled: open, queryFn: async () => {
    const { data, error } = await supabase.from('global_ai_documents').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } });
  const upload = async (file: File, rawText?: string) => {
    if (!user) throw new Error('נדרשת התחברות');
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('יש לבחור קובץ עד 20MB');
    const extracted = rawText ?? await brainFileText(file);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await supabase.storage.from('global-ai-training').upload(path, file);
    if (error) throw error;
    try {
      const sourceType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type === 'application/pdf' ? 'pdf' : 'text';
      const result = await supabase.functions.invoke('global-ai-ingest', { body: { title: file.name, storage_path: path, raw_text: extracted, source_type: sourceType, mime_type: file.type } });
      if (result.error || result.data?.error) throw new Error(result.data?.error ?? result.error?.message ?? 'ההעלאה נכשלה');
    } catch (error) { await supabase.storage.from('global-ai-training').remove([path]); throw error; }
    await qc.invalidateQueries({ queryKey: key });
  };
  const handleFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try { for (const file of Array.from(files)) await upload(file); toast.success('קובצי האימון נשמרו לכל סביבות העבודה'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'ההעלאה נכשלה'); }
    finally { setBusy(false); }
  };
  const saveText = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    try { const content = body.trim(); await upload(new File([content], brainTextDocumentName(content), { type: 'text/plain' }), content); setBody(''); toast.success('המסמך הגלובלי נוסף'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'השמירה נכשלה'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('global_ai_documents').delete().eq('id', id);
      if (error) throw error;
      const doc = docs.data?.find(d => d.id === id);
      if (doc) await supabase.storage.from('global-ai-training').remove([doc.storage_path]);
      await qc.invalidateQueries({ queryKey: key });
      if (selected?.id === id) setSelected(null);
    } catch { toast.error('המחיקה נכשלה'); }
    finally { setDeleting(false); }
  };
  const saveLink = async () => {
    let url: URL;
    try { url = new URL(link); if (url.protocol !== 'https:') throw new Error(); }
    catch { toast.error('יש להזין קישור HTTPS תקין'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('kb-ingest-link', { body: { url: url.href, intent, scope: 'global' } });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      await qc.invalidateQueries({ queryKey: key });
      setLink(''); setIntent(''); toast.success('הקישור וההנחיות נשמרו');
    }
    catch { toast.error('שמירת הקישור נכשלה'); }
    finally { setBusy(false); }
  };
  const filtered = (docs.data ?? []).filter(d => (filter === 'all' || (filter === 'images' ? d.source_type === 'image' : filter === 'videos' ? d.source_type === 'video' : ['pdf', 'text', 'audio'].includes(d.source_type))) && (!search.trim() || `${d.title} ${d.raw_text}`.toLowerCase().includes(search.trim().toLowerCase())));
  return <Card dir="rtl" id="global-ai-brain" className="border-destructive/40">
    <Button variant="ghost" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="global-ai-brain-body" className="h-auto w-full justify-between gap-3 p-4 text-right">
      <span className="flex min-w-0 items-center gap-2"><ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} /><Brain className="h-5 w-5 shrink-0 text-primary" /><span className="truncate text-sm font-semibold">מוח AI גלובלי - ריטה</span></span>
    </Button>
    {open && <div id="global-ai-brain-body" className="space-y-4 border-t p-5 text-sm">
      <section aria-label="ספריית המסמכים הגלובלית" className="space-y-2"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי תיאור / כיתוב" className="pr-9" /></div>
        <div className="flex flex-wrap gap-2">{[{ id: 'all', label: 'הכל' }, { id: 'images', label: 'תמונות' }, { id: 'videos', label: 'סרטונים' }, { id: 'docs', label: 'מסמכים' }].map(f => <Button key={f.id} variant={filter === f.id ? 'default' : 'outline'} className="h-auto rounded-full px-3 py-1.5 text-xs" onClick={() => setFilter(f.id)}>{f.label}</Button>)}</div>
        {docs.isError ? <p className="text-destructive">לא ניתן לטעון את הקבצים.</p> : docs.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : filtered.length ? <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">{filtered.map(d => <BrainDocumentCard key={d.id} document={d} onOpen={() => setSelected(d)} onDelete={() => void remove(d.id)} deleting={deleting} />)}</div> : <p className="text-xs text-muted-foreground text-center py-8">אין פריטים להצגה</p>}
      </section>
      <BrainTabs value={tab} onChange={setTab} />
      {tab === 'files' && <BrainUploadZone busy={busy} onFiles={files => void handleFiles(files)} />}
      {(tab === 'text' || tab === 'ai') && <BrainTextEntry value={body} onChange={setBody} busy={busy} onAdd={() => void saveText()} />}
      {tab === 'link' && <div className="space-y-2"><Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." dir="ltr" /><Textarea value={intent} onChange={e => setIntent(e.target.value)} placeholder="מה ללמוד מהמקור הזה?" className="min-h-[80px]" /><div className="flex justify-end"><Button onClick={() => void saveLink()} disabled={busy}>{busy ? 'שומר…' : 'הוסף קישור'}</Button></div></div>}
    </div>}
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent dir="rtl" className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader><p className="whitespace-pre-wrap text-sm">{selected?.raw_text}</p></DialogContent></Dialog>
  </Card>;
}
