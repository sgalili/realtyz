import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Video, Sparkles, Type, Link, Loader2, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { cn } from '@/lib/utils';

export type BrainTab = 'ai' | 'files' | 'text' | 'link';
const tabs = [
  { id: 'ai' as const, label: 'AI', icon: Sparkles },
  { id: 'files' as const, label: 'קבצים', icon: FileText },
  { id: 'text' as const, label: 'טקסט', icon: Type },
  { id: 'link' as const, label: 'קישור', icon: Link },
];

export function BrainTabs({ value, onChange }: { value: BrainTab; onChange: (tab: BrainTab) => void }) {
  return <div role="tablist" aria-label="מאגר הידע" className="flex gap-1 p-1 rounded-lg bg-muted">
    {tabs.map(({ id, label, icon: Icon }) => <Button key={id} role="tab" aria-selected={value === id} variant="ghost" onClick={() => onChange(id)}
      className={cn('h-auto min-w-0 flex-1 gap-1.5 px-2 py-2 text-xs font-medium rounded-md', value === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
      <Icon className="h-3.5 w-3.5 shrink-0" />{label}
    </Button>)}
  </div>;
}

export function BrainUploadZone({ busy, onFiles }: { busy: boolean; onFiles: (files: FileList | File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div role="button" tabIndex={busy ? -1 : 0} aria-label="העלאת קבצי אימון" aria-disabled={busy}
    onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) onFiles(e.dataTransfer.files); }}
    onClick={() => { if (!busy) input.current?.click(); }}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) input.current?.click(); } }}
    className={cn('border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/30')}>
    <input ref={input} type="file" multiple aria-label="קבצי אימון" className="hidden" disabled={busy} onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }} />
    {busy ? <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />}
    <p className="text-sm font-medium">גרור קבצים לכאן או לחץ לבחירה</p>
    <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, TXT, CSV, תמונות, וידאו, אודיו</p>
  </div>;
}

export function BrainTextEntry({ value, onChange, busy, onAdd }: { value: string; onChange: (text: string) => void; busy: boolean; onAdd: () => void }) {
  return <div className="space-y-2">
    <div className="relative">
      <Textarea value={value} onChange={e => onChange(e.target.value)} disabled={busy} aria-label="הנחיות או מידע למאגר הידע" placeholder="הנחיות או מידע למאגר הידע" className="min-h-[140px] pt-10" />
      <div className="absolute top-1 start-1"><VoiceInputButton size="sm" disabled={busy} onTranscript={text => onChange(`${value} ${text}`.trim())} /></div>
    </div>
    <div className="flex justify-end"><Button onClick={onAdd} disabled={busy || !value.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף'}</Button></div>
  </div>;
}

export interface BrainDocument {
  id: string; title: string; source_type: string; raw_text: string | null; created_at: string; chunk_count: number | null;
  source_metadata?: unknown;
}

export function BrainDocumentCard({ document: d, onOpen, onDelete, deleting }: { document: BrainDocument; onOpen: () => void; onDelete: () => void; deleting: boolean }) {
  const Icon = d.source_type === 'image' ? ImageIcon : d.source_type === 'video' ? Video : FileText;
  const meta = (d.source_metadata ?? {}) as { thumbnail?: string; video_id?: string; source_author?: string; description?: string };
  const isVideo = d.source_type === 'video';
  const thumb = meta.thumbnail || (meta.video_id ? `https://i.ytimg.com/vi/${meta.video_id}/hqdefault.jpg` : '');
  const title = isVideo && /^https?:\/\//i.test(d.title) && meta.source_author ? meta.source_author : d.title;
  const snippet = (isVideo ? meta.description ?? '' : d.raw_text ?? '').replace(/\s+/g, ' ').slice(0, isVideo ? 140 : 110);
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    className="flex items-start gap-2 p-2 rounded-md border bg-background hover:bg-muted/30 transition-colors cursor-pointer">
    {isVideo && thumb ? <img src={thumb} alt="" loading="lazy" className="h-14 w-20 rounded object-cover shrink-0 bg-muted" /> : <Icon className="h-4 w-4 text-primary shrink-0 mt-1" />}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate">{title}</div>
      {isVideo && meta.source_author && title !== meta.source_author && <div className="text-[11px] text-muted-foreground truncate">{meta.source_author}</div>}
      {snippet && <div className="text-[11px] text-muted-foreground line-clamp-2">{snippet}</div>}
      <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(d.created_at).toLocaleString('he-IL')} · {d.chunk_count ?? 0} מקטעים</div>
    </div>
    <Button variant="ghost" size="icon" aria-label={`מחק ${d.title}`} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(); }} disabled={deleting}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>;
}