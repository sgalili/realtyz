import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { BrainTabs, BrainUploadZone, BrainDocumentCard, type BrainTab, type BrainDocument } from '@/components/ai-brain/BrainResources';
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
  const [tab, setTab] = useState<BrainTab>('ai');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [intent, setIntent] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<BrainDocument | null>(null);
  const key = ['global-ai-documents', user?.id];
  const { data, isPending, isError } = useQuery({
    queryKey: ['global-ai-config', user?.id], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('global_ai_config').select('master_prompt, updated_at').eq('id', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const docs = useQuery({ queryKey: key, enabled: open, queryFn: async () => {
    const { data, error } = await supabase.from('global_ai_documents').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } });
  useEffect(() => { if (data) setText(data.master_prompt ?? ''); }, [data]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('global_ai_config').upsert({ id: true, master_prompt: text, updated_by: user.id, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success('ההנחיות הגלובליות נשמרו לכל סביבות העבודה');
      void qc.invalidateQueries({ queryKey: ['global-ai-config'] });
    } catch { toast.error('השמירה נכשלה'); }
    finally { setSaving(false); }
  };

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
    if (!title.trim() || !body.trim()) { toast.error('יש למלא כותרת ותוכן'); return; }
    setBusy(true);
    try { await upload(new File([body], title.trim(), { type: 'text/plain' }), body); setTitle(''); setBody(''); toast.success('המסמך הגלובלי נשמר'); }
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
      <BrainTabs value={tab} onChange={setTab} />
      {tab === 'ai' && (isError ? <p className="text-destructive">לא ניתן לטעון את ההגדרות.</p> : isPending ? <p className="text-muted-foreground">טוען…</p> : <div className="space-y-3">
        <div className="relative"><Textarea value={text} onChange={e => setText(e.target.value)} className="min-h-[140px] pt-10" placeholder="הנחיות מערכת גלובליות" aria-label="הנחיות מערכת גלובליות" /><div className="absolute top-1 start-1"><VoiceInputButton size="sm" onTranscript={t => setText(p => `${p} ${t}`.trim())} /></div></div>
        <div className="flex justify-between items-center gap-2"><span className="text-xs text-muted-foreground">{data?.updated_at ? `עודכן: ${new Date(data.updated_at).toLocaleString('he-IL')}` : ''}</span><Button onClick={() => void save()} disabled={saving}>{saving ? 'שומר…' : 'שמירה'}</Button></div>
      </div>)}
      {tab === 'files' && <BrainUploadZone busy={busy} onFiles={files => void handleFiles(files)} />}
      {tab === 'text' && <div className="space-y-2"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת" /><div className="relative"><Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="הנחיות או מידע למאגר הידע" className="min-h-[140px] pt-10" /><div className="absolute top-1 start-1"><VoiceInputButton size="sm" onTranscript={t => setBody(p => `${p} ${t}`.trim())} /></div></div><div className="flex justify-end"><Button onClick={() => void saveText()} disabled={busy}>{busy ? 'שומר…' : 'שמור למאגר'}</Button></div></div>}
      {tab === 'link' && <div className="space-y-2"><Input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." dir="ltr" /><Textarea value={intent} onChange={e => setIntent(e.target.value)} placeholder="מה ללמוד מהמקור הזה?" className="min-h-[80px]" /><div className="flex justify-end"><Button onClick={() => void saveLink()} disabled={busy}>{busy ? 'שומר…' : 'הוסף קישור'}</Button></div></div>}
      <div className="space-y-2 pt-2"><div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי תיאור / כיתוב" className="pr-9" /></div>
        <div className="flex flex-wrap gap-2">{[{ id: 'all', label: 'הכל' }, { id: 'images', label: 'תמונות' }, { id: 'videos', label: 'סרטונים' }, { id: 'docs', label: 'מסמכים' }].map(f => <Button key={f.id} variant={filter === f.id ? 'default' : 'outline'} className="h-auto rounded-full px-3 py-1.5 text-xs" onClick={() => setFilter(f.id)}>{f.label}</Button>)}</div>
        {docs.isError ? <p className="text-destructive">לא ניתן לטעון את הקבצים.</p> : docs.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : filtered.length ? <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">{filtered.map(d => <BrainDocumentCard key={d.id} document={d} onOpen={() => setSelected(d)} onDelete={() => void remove(d.id)} deleting={deleting} />)}</div> : <p className="text-xs text-muted-foreground text-center py-8">אין פריטים להצגה</p>}
      </div>
    </div>}
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent dir="rtl" className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader><p className="whitespace-pre-wrap text-sm">{selected?.raw_text}</p></DialogContent></Dialog>
  </Card>;
}
