import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Send, Loader2, Upload, Search, FileText, Link as LinkIcon, Mic, Type, Trash2, Image as ImageIcon, Video as VideoIcon, Pencil, X, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { GeminiIcon } from '@/components/GeminiIcon';


type ChatMsg = { role: 'user' | 'assistant'; content: string; sources?: string[]; isError?: boolean };
type Tab = 'ai' | 'files' | 'text' | 'link' | 'voice';
type Filter = 'all' | 'images' | 'videos' | 'docs';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const { settings } = useWhiteLabel();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();

  const brand = settings?.agency_name || 'Realtyz AI';

  /* ── Knowledge tester chat ── */
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [viewDoc, setViewDoc] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openDoc = (d: any) => {
    setViewDoc(d);
    setIsEditing(false);
    setEditTitle(d?.title ?? '');
    setEditBody(d?.raw_text ?? '');
  };

  const saveEdit = async () => {
    if (!viewDoc) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('knowledge_documents')
        .update({ title: editTitle.trim() || viewDoc.title, raw_text: editBody })
        .eq('id', viewDoc.id);
      if (error) throw error;
      toast.success('עודכן');
      setViewDoc({ ...viewDoc, title: editTitle.trim() || viewDoc.title, raw_text: editBody });
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בשמירה');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next: ChatMsg[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('kb-chat', {
        body: { messages: next.map(({ role, content }) => ({ role, content })) },
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        setChatMessages((p) => [...p, { role: 'assistant', content: data.error, isError: true }]);
      } else {
        setChatMessages((p) => [...p, {
          role: 'assistant',
          content: data?.content ?? 'לא התקבלה תשובה.',
          sources: data?.sources,
        }]);
      }
    } catch (e: any) {
      setChatMessages((p) => [...p, { role: 'assistant', content: `שגיאה: ${e.message}`, isError: true }]);
    } finally {
      setChatLoading(false);
    }
  };

  /* ── Resource management ── */
  const [tab, setTab] = useState<Tab>('files');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkIntent, setLinkIntent] = useState('');

  /* ── Voice recorder ── */
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceTitle, setVoiceTitle] = useState('');
  const [voiceIntent, setVoiceIntent] = useState('');
  const [recElapsed, setRecElapsed] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };

  const startRecording = async () => {
    if (blockDemoAction('record-knowledge-audio')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mime });
        await transcribeBlob(blob);
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = window.setInterval(() => setRecElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error(`לא ניתן לגשת למיקרופון: ${e?.message ?? ''}`);
    }
  };

  const stopRecording = () => {
    stopTimer();
    setRecording(false);
    mediaRecRef.current?.stop();
  };

  const transcribeBlob = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio_data_url: dataUrl, mime_type: blob.type, language: 'he' },
      });
      if (error) throw error;
      const txt = (data as any)?.text?.trim?.() ?? '';
      if (!txt) throw new Error('לא זוהה דיבור בהקלטה');
      setVoiceText(txt);
      toast.success('התמלול הושלם — ניתן לערוך ולשמור');
    } catch (e: any) {
      toast.error(`כשל בתמלול: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setTranscribing(false);
    }
  };

  const saveVoice = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('save-knowledge-audio')) throw new Error('demo-blocked');
      const body = voiceText.trim();
      if (!body) throw new Error('אין טקסט לשמירה');
      const { error } = await supabase.functions.invoke('kb-ingest', {
        body: {
          title: voiceTitle.trim() || `הקלטה · ${new Date().toLocaleString('he-IL')}`,
          raw_text: body,
          source_type: 'audio',
          source_metadata: { learning_intent: voiceIntent.trim() || null, captured_via: 'voice-record' },
        },
      });
      if (error) throw error;
      // Also try to capture as a system rule (fire-and-forget)
      supabase.functions.invoke('ingest-system-rule', {
        body: { text: body, source: 'whatsapp_voice', role: 'owner' },
      }).catch(() => {});
    },
    onSuccess: () => {
      toast.success('נשמר למאגר');
      setVoiceText(''); setVoiceTitle(''); setVoiceIntent(''); setRecElapsed(0);
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    onError: (e: Error) => { if (e.message !== 'demo-blocked') toast.error(e.message); },
  });

  useEffect(() => () => { stopTimer(); mediaRecRef.current?.stream?.getTracks().forEach((t) => t.stop()); }, []);

  /* ── Documents list ── */
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['kb-documents', workspaceOwnerId],
    enabled: !!workspaceOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('id, title, source_type, chunk_count, created_at, raw_text, source_metadata')
        .eq('user_id', workspaceOwnerId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_documents').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הפריט נמחק');
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const getSourceType = (file: File) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
    return 'text';
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (blockDemoAction('upload-knowledge-document')) return;
    setIngesting(true);
    for (const file of list) {
      try {
        const sourceType = getSourceType(file);
        const isTextLike = sourceType === 'text' || sourceType === 'pdf';
        const payload = isTextLike
          ? { title: file.name, raw_text: await file.text(), source_type: sourceType, source_metadata: { mime_type: file.type, size: file.size } }
          : { title: file.name, file_data_url: await fileToDataUrl(file), mime_type: file.type, source_type: sourceType, source_metadata: { mime_type: file.type, size: file.size } };
        const { error } = await supabase.functions.invoke('kb-ingest', { body: payload });
        if (error) throw error;
        toast.success(`נטען: ${file.name}`);
      } catch (e: any) {
        toast.error(`כשל בטעינת ${file.name}: ${e?.message ?? 'שגיאה'}`);
      }
    }
    setIngesting(false);
    qc.invalidateQueries({ queryKey: ['kb-documents'] });
  }, [qc, blockDemoAction]);

  const saveText = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('add-knowledge-text')) throw new Error('demo-blocked');
      if (!textBody.trim()) throw new Error('יש להזין תוכן');
      const { error } = await supabase.functions.invoke('kb-ingest', {
        body: {
          title: textTitle.trim() || `הערה · ${new Date().toLocaleString('he-IL')}`,
          raw_text: textBody.trim(),
          source_type: 'text',
        },
      });
      if (error) throw error;
      // Also try to capture as a system rule (fire-and-forget)
      supabase.functions.invoke('ingest-system-rule', {
        body: { text: textBody.trim(), source: 'kb_ui', role: 'owner' },
      }).catch(() => {});
    },
    onSuccess: () => {
      toast.success('נשמר למאגר');
      setTextTitle(''); setTextBody('');
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    onError: (e: Error) => { if (e.message !== 'demo-blocked') toast.error(e.message); },
  });

  const saveLink = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('add-knowledge-link')) throw new Error('demo-blocked');
      const url = linkUrl.trim();
      if (!url) throw new Error('יש להזין קישור');
      const { data, error } = await supabase.functions.invoke('kb-ingest-link', {
        body: { url, intent: linkIntent.trim() || undefined },
      });
      if (error) throw error;
      const payload = data as { title?: string; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      return payload?.title ?? url;
    },
    onSuccess: (title) => {
      toast.success(`נוסף למאגר: ${title}`);
      setLinkUrl('');
      setLinkIntent('');
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
      qc.invalidateQueries({ queryKey: ['media-library'] });
    },
    onError: (e: Error) => { if (e.message !== 'demo-blocked') toast.error(e.message); },
  });

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'files', label: 'קבצים', icon: FileText },
    { id: 'text', label: 'טקסט', icon: Type },
    { id: 'link', label: 'קישור', icon: LinkIcon },
    { id: 'voice', label: 'הקלטה', icon: Mic },
  ];

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'הכל' },
    { id: 'images', label: 'תמונות' },
    { id: 'videos', label: 'סרטונים' },
    { id: 'docs', label: 'מסמכים' },
  ];

  return (
    <div className="space-y-6" dir="rtl">




      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RIGHT (first in RTL): Resource management */}
        <Card>
          <CardContent className="p-5 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {tab === 'files' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                {ingesting ? (
                  <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                )}
                <p className="text-sm font-medium">גרור קבצים לכאן או לחץ לבחירה</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, Word, Excel, TXT, CSV, תמונות, וידאו, אודיו
                </p>
              </div>
            )}

            {tab === 'text' && (
              <div className="space-y-2">
                <Input
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="כותרת"
                />
                <Textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  placeholder="הקלד חוקי התנהגות, הנחיות לסוכן או מידע על נכסים עבור מאגר הידע (לדוגמה: 'מעכשיו תתמקד תמיד בדירות להשקעה ברעננה ותדגיש שיש חניה...')"
                  className="min-h-[140px]"
                />
                <div className="flex justify-end">
                  <Button onClick={() => saveText.mutate()} disabled={saveText.isPending}>
                    {saveText.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור למאגר'}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'link' && (
              <div className="space-y-2">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                />
                <Textarea
                  value={linkIntent}
                  onChange={(e) => setLinkIntent(e.target.value)}
                  placeholder="מה ללמוד מהמקור הזה? (לדוגמה: טכניקות סגירה, התמודדות עם התנגדויות מחיר...)"
                  className="min-h-[80px]"
                />
                <div className="flex justify-end">
                  <Button onClick={() => saveLink.mutate()} disabled={saveLink.isPending}>
                    {saveLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף קישור'}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'voice' && (
              <div className="space-y-3">
                <div className="border rounded-lg p-5 text-center bg-muted/30 space-y-3">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={recording ? stopRecording : startRecording}
                      disabled={transcribing}
                      className={`h-16 w-16 rounded-full flex items-center justify-center transition-all ${
                        recording
                          ? 'bg-destructive text-destructive-foreground animate-pulse'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      } disabled:opacity-50`}
                      aria-label={recording ? 'עצור הקלטה' : 'התחל הקלטה'}
                    >
                      {transcribing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Mic className="h-7 w-7" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {transcribing
                      ? 'מתמלל...'
                      : recording
                        ? `מקליט · ${Math.floor(recElapsed / 60)}:${String(recElapsed % 60).padStart(2, '0')} — לחץ לעצירה`
                        : 'לחץ כדי להתחיל הקלטה קולית'}
                  </p>
                </div>

                {voiceText && (
                  <div className="space-y-2">
                    <Input
                      value={voiceTitle}
                      onChange={(e) => setVoiceTitle(e.target.value)}
                      placeholder="כותרת"
                    />
                    <Textarea
                      value={voiceText}
                      onChange={(e) => setVoiceText(e.target.value)}
                      placeholder="התמלול יופיע כאן — ניתן לערוך"
                      className="min-h-[140px]"
                    />
                    <Textarea
                      value={voiceIntent}
                      onChange={(e) => setVoiceIntent(e.target.value)}
                      placeholder="מה ללמוד מההקלטה הזו?"
                      className="min-h-[60px]"
                    />
                    <div className="flex justify-between gap-2">
                      <Button variant="ghost" onClick={() => { setVoiceText(''); setVoiceTitle(''); setVoiceIntent(''); }}>
                        ביטול
                      </Button>
                      <Button onClick={() => saveVoice.mutate()} disabled={saveVoice.isPending}>
                        {saveVoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמור למאגר'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search + filters */}
            <div className="space-y-2 pt-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי תיאור / כיתוב"
                  className="pr-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map((f) => {
                  const active = filter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              {(() => {
                const matchFilter = (st: string) => {
                  if (filter === 'all') return true;
                  if (filter === 'images') return st === 'image';
                  if (filter === 'videos') return st === 'video';
                  if (filter === 'docs') return ['pdf', 'text', 'whatsapp', 'audio'].includes(st);
                  return true;
                };
                const q = search.trim().toLowerCase();
                const filtered = documents.filter((d: any) =>
                  matchFilter(d.source_type) &&
                  (!q || (d.title?.toLowerCase().includes(q) || d.raw_text?.toLowerCase().includes(q)))
                );
                if (docsLoading) {
                  return (
                    <div className="text-xs text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען...
                    </div>
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      אין פריטים להצגה
                    </div>
                  );
                }
                const iconFor = (st: string) => {
                  if (st === 'image') return ImageIcon;
                  if (st === 'video') return VideoIcon;
                  return FileText;
                };
                return (
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                    {filtered.map((d: any) => {
                      const Icon = iconFor(d.source_type);
                      const meta = (d.source_metadata ?? {}) as {
                        thumbnail?: string;
                        source_author?: string;
                        source_url?: string;
                        description?: string;
                        video_id?: string;
                      };
                      const isVideo = d.source_type === 'video';
                      const thumb = meta.thumbnail || (meta.video_id ? `https://i.ytimg.com/vi/${meta.video_id}/hqdefault.jpg` : '');
                      const isUrlTitle = /^https?:\/\//i.test(d.title ?? '');
                      const displayTitle = isVideo && isUrlTitle && meta.source_author
                        ? meta.source_author
                        : (d.title ?? '');
                      const snippet = isVideo
                        ? (meta.description ?? '').replace(/\s+/g, ' ').slice(0, 140)
                        : (d.raw_text ?? '').replace(/\s+/g, ' ').slice(0, 110);
                      return (
                        <div
                          key={d.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openDoc(d)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(d); } }}
                          className="flex items-start gap-2 p-2 rounded-md border bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          {isVideo && thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              loading="lazy"
                              className="h-14 w-20 rounded object-cover shrink-0 bg-muted"
                            />
                          ) : (
                            <Icon className="h-4 w-4 text-primary shrink-0 mt-1" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{displayTitle}</div>
                            {isVideo && meta.source_author && displayTitle !== meta.source_author && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {meta.source_author}
                              </div>
                            )}
                            {snippet && (
                              <div className="text-[11px] text-muted-foreground line-clamp-2">
                                {snippet}
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(d.created_at).toLocaleString('he-IL')} · {d.chunk_count ?? 0} מקטעים
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteDoc.mutate(d.id); }}
                            disabled={deleteDoc.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* LEFT (second in RTL): Knowledge tester */}
        <Card>
          <CardContent className="p-5 flex flex-col h-full min-h-[420px]">
            <div className="mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                בדיקת מאגר הידע
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                שאל שאלות וראה איך ה-AI עונה על סמך המסמכים שהעלית
              </p>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2 min-h-[240px]">
              {chatMessages.length === 0 && !chatLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Brain className="h-8 w-8 text-primary/60" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-[240px]">
                    שאל שאלה כדי לבדוק מה ה-AI יודע מהמאגר
                  </p>
                </div>
              ) : (
                <>
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed max-w-[90%] ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground ms-auto'
                          : m.isError
                            ? 'bg-destructive/15 text-destructive border border-destructive/30'
                            : 'bg-background border'
                      }`}
                    >
                      {m.content}
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                          {m.sources.map((s, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">
                              <FileText className="h-2.5 w-2.5 me-1" />{s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> מחפש במאגר...
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-end gap-2 mt-3">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
                }}
                placeholder="שאל שאלה על המאגר..."
                rows={1}
                dir="rtl"
                disabled={chatLoading}
                className="flex-1 min-h-[44px] max-h-32 resize-none"
              />
              <Button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-slate-700 hover:bg-slate-800 text-white gap-1.5"
              >
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שלח
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>



      <Dialog open={!!viewDoc} onOpenChange={(o) => { if (!o) { setViewDoc(null); setIsEditing(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" dir="rtl">
          <DialogHeader>
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="כותרת"
                className="text-right font-semibold"
              />
            ) : (
              <DialogTitle className="text-right pe-8">{viewDoc?.title}</DialogTitle>
            )}
            <p className="text-xs text-muted-foreground text-right">
              {viewDoc && new Date(viewDoc.created_at).toLocaleString('he-IL')} · {viewDoc?.chunk_count ?? 0} מקטעים
            </p>
          </DialogHeader>
          {isEditing ? (
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="flex-1 min-h-[260px] text-sm leading-relaxed"
              placeholder="תוכן..."
            />
          ) : (
            <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap leading-relaxed">
              {viewDoc?.raw_text?.trim()
                ? viewDoc.raw_text
                : <span className="text-muted-foreground">אין תוכן טקסטואלי זמין לתצוגה.</span>}
            </div>
          )}
          <div className="flex justify-start gap-2 pt-2">
            {isEditing ? (
              <>
                <Button onClick={saveEdit} disabled={savingEdit} size="sm" className="gap-1.5">
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  שמור
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsEditing(false); setEditTitle(viewDoc?.title ?? ''); setEditBody(viewDoc?.raw_text ?? ''); }}
                  className="gap-1.5"
                >
                  <X className="h-4 w-4" /> ביטול
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5">
                <Pencil className="h-4 w-4" /> עריכה
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
