import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Send, Loader2, Upload, Search, FileText, Link as LinkIcon, Mic, Type, Trash2, Image as ImageIcon, Video as VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';

type ChatMsg = { role: 'user' | 'assistant'; content: string; sources?: string[]; isError?: boolean };
type Tab = 'files' | 'text' | 'link' | 'voice';
type Filter = 'all' | 'images' | 'videos' | 'docs';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const { settings } = useWhiteLabel();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();

  const brand = settings?.agency_name || 'Realtyz AI';

  /* ── Knowledge tester chat ── */
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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
      if (!linkUrl.trim()) throw new Error('יש להזין קישור');
      const { error } = await supabase.functions.invoke('kb-ingest', {
        body: { title: linkUrl, raw_text: linkUrl, source_type: 'text', source_metadata: { url: linkUrl } },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('הקישור נוסף'); setLinkUrl(''); },
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
                  placeholder="כותרת (אופציונלי)"
                />
                <Textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  placeholder="הקלד את התוכן..."
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
                <div className="flex justify-end">
                  <Button onClick={() => saveLink.mutate()} disabled={saveLink.isPending}>
                    {saveLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוסף קישור'}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'voice' && (
              <div className="border rounded-lg p-8 text-center bg-muted/30">
                <Mic className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">הקלטה קולית — בקרוב</p>
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
              <div className="text-xs text-muted-foreground text-center py-8">
                אין פריטים להצגה
              </div>
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
    </div>
  );
}
