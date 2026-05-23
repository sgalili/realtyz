import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Textarea } from '@/components/ui/textarea';
import {
  Upload, FileText, Trash2, Phone, Plus, CheckCircle2, Loader2, FileCheck,
  Image, Video, Mic, Sparkles, Brain, RefreshCw, BookOpen, MessageSquare, Send,
} from 'lucide-react';
import { SectionDivider } from '@/components/SectionDivider';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { getDemoCandidateKnowledgeDocuments } from '@/lib/demoData';
import { WhatsAppConversationImporter } from '@/components/strategybank/WhatsAppConversationImporter';
import { UniversalKnowledgeInput } from '@/components/strategybank/UniversalKnowledgeInput';
import { MediaLibraryPanel } from '@/components/MediaLibraryPanel';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  
  const [waPhone, setWaPhone] = useState('');
  const [waLabel, setWaLabel] = useState('');

  /* ── KB Chat ── */
  type ChatMsg = { role: 'user' | 'assistant'; content: string; sources?: string[]; isError?: boolean };
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const sendKbChat = async () => {
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
        setChatMessages((p) => [...p, { role: 'assistant', content: data?.content ?? 'לא התקבלה תשובה.', sources: data?.sources }]);
      }
    } catch (e: any) {
      setChatMessages((p) => [...p, { role: 'assistant', content: `שגיאה: ${e.message}`, isError: true }]);
    } finally {
      setChatLoading(false);
    }
  };

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

  /* ── Documents ── */
  const { data: docs = [] } = useQuery({
    queryKey: ['kb-documents', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });
  const activeDocs = isDemoMode ? getDemoCandidateKnowledgeDocuments(demoCandidateId) : docs;


  /* ── WA Whitelist ── */
  const { data: whitelist = [] } = useQuery({
    queryKey: ['kb-whitelist', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('kb_whitelist')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const addWhitelist = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('add-kb-whitelist')) throw new Error('demo-blocked');
      if (!waPhone.trim()) throw new Error('יש להזין מספר טלפון');
      const normalized = waPhone.replace(/\D/g, '');
      const { error } = await supabase
        .from('kb_whitelist')
        .insert({ user_id: user!.id, phone_number: normalized, label: waLabel || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-whitelist'] });
      setWaPhone(''); setWaLabel('');
      toast.success('מספר נוסף לרשימת ההיתרים');
    },
    onError: (e: Error) => { if (e.message !== 'demo-blocked') toast.error(e.message); },
  });

  const removeWhitelist = useMutation({
    mutationFn: async (id: string) => {
      if (blockDemoAction('remove-kb-whitelist')) return;
      const { error } = await supabase.from('kb_whitelist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-whitelist'] });
      toast.success('הוסר');
    },
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      if (blockDemoAction('delete-knowledge-document')) return;
      await supabase.from('knowledge_chunks').delete().eq('document_id', id);
      const { error } = await supabase.from('knowledge_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
      toast.success('מסמך נמחק');
    },
  });


  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
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
          const { error } = await supabase.functions.invoke('kb-ingest', {
            body: payload,
          });
          if (error) throw error;
          toast.success(`נטען: ${file.name}`);
        } catch (e: any) {
          const msg = typeof e?.message === 'string' ? e.message : JSON.stringify(e);
          toast.error(`כשל בטעינת ${file.name}: ${msg}`);
        }
      }
      setIngesting(false);
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    [qc]
  );

  const demoDocuments = [
    { id: 'demo-1', title: 'הסכם בלעדיות לשיווק נכס.pdf', type: 'PDF', chunks: 86 },
    { id: 'demo-2', title: 'מדריך לטיפול בהתנגדויות מחיר קונים.docx', type: 'DOCX', chunks: 42 },
    { id: 'demo-3', title: 'תסריט שיחה ללידים חמים מאתר הומלי.txt', type: 'TXT', chunks: 28 },
    { id: 'demo-4', title: 'מחירון עמלות תיווך ונהלי סגירה.pdf', type: 'PDF', chunks: 19 },
  ];
  const coreValues = ['מקצועיות', 'אמינות', 'שקיפות', 'שירות אישי'];
  const qaPairs = [
    {
      q: 'מה גובה העמלה המקובלת בעסקת מכירה?',
      a: 'העמלה הסטנדרטית היא 2% מערך העסקה בתוספת מע"מ, משולמת במעמד חתימת ההסכם. ניתן להתאים לפי סוג הנכס והבלעדיות.',
    },
    {
      q: 'איך מתמודדים עם קונה שטוען שהמחיר גבוה מדי?',
      a: 'מציגים השוואת עסקאות אחרונות באזור, מדגישים יתרונות ייחודיים של הנכס, ובוחנים פערים אמיתיים לעומת התנגדות טקטית לפני משא ומתן.',
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">מאגר הידע</h1>
        <p className="text-sm text-muted-foreground mt-1">
          הזן מסמכי תיווך, תסריטי שיחה והודעות WhatsApp למוח של סוכן ה-AI. כל ידע מומר לווקטורים סמנטיים לחיפוש מדויק.
        </p>
      </div>
      {isDemoMode && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" /> מקורות ידע פעילים
                </CardTitle>
                <CardDescription>הספרייה שמזינה את מוח ה-AI של המשרד</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {demoDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doc.title}</div>
                      <div className="text-xs text-muted-foreground">{doc.type} · {doc.chunks} מקטעים סמנטיים</div>
                    </div>
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> נותח
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> ערכי ליבה מזוהים
                </CardTitle>
                <CardDescription>חולצו אוטומטית מהמסמכים שהוזנו</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {coreValues.map((v) => (
                    <Badge key={v} variant="outline" className="px-3 py-1 text-sm border-primary/40 text-primary">
                      {v}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground leading-relaxed">
                  ה-AI מצליב את הערכים הללו עם כל הודעה יוצאת כדי לשמר עקביות מסר.
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" /> בדיקת ה-AI: זוגות אימון לדוגמה
              </CardTitle>
              <CardDescription>כך ה-AI עונה על שאלות מתעניינים בהתבסס על המסמכים שהוזנו</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {qaPairs.map((pair, idx) => (
                <div key={idx} className="rounded-md border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="shrink-0">שאלה</Badge>
                    <p className="text-sm font-medium">{pair.q}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge className="shrink-0 bg-primary text-primary-foreground">תשובת AI</Badge>
                    <p className="text-sm text-muted-foreground leading-relaxed">{pair.a}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <div className="w-full space-y-4">
        <UniversalKnowledgeInput />
        <WhatsAppConversationImporter />
        <MediaLibraryPanel />
      </div>

      {/* ─── KB Chat ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" /> שיחה עם מאגר הידע
          </CardTitle>
          <CardDescription>
            שאל שאלות וקבל תשובות אך ורק על סמך המסמכים שהעלית למאגר. לא נעשה שימוש בידע חיצוני.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            ref={chatScrollRef}
            className="h-72 overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2"
          >
            {chatMessages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-10">
                התחל שיחה — לדוגמה: "מה גובה העמלה המקובלת?" או "איך עונים על התנגדות מחיר?"
              </p>
            )}
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
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendKbChat();
                }
              }}
              placeholder="שאל שאלה על מאגר הידע..."
              rows={1}
              dir="rtl"
              disabled={chatLoading}
              className="flex-1 min-h-[44px] max-h-32 resize-none"
            />
            <Button onClick={sendKbChat} disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            {chatMessages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setChatMessages([])}>
                נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── WhatsApp Whitelist ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> רשימת מורשים
          </CardTitle>
          <CardDescription>
            רק מספרים ברשימה הזו יכולים לשלוח הודעות עם <code className="bg-muted px-1 rounded">/kb</code> או <code className="bg-muted px-1 rounded">#knowledge</code> להזנה אוטומטית למאגר
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">מספר טלפון</Label>
              <Input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="0501234567"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs">תווית (אופציונלי)</Label>
              <Input value={waLabel} onChange={(e) => setWaLabel(e.target.value)} placeholder="מנהל קמפיין" />
            </div>
            <Button onClick={() => addWhitelist.mutate()} disabled={addWhitelist.isPending}>
              <Plus className="h-4 w-4" /> הוסף
            </Button>
          </div>
          <div className="space-y-1">
            {whitelist.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">אין מספרים מאושרים עדיין</p>
            )}
            {whitelist.map((w) => (
              <div key={w.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-mono text-sm" dir="ltr">{w.phone_number}</span>
                {w.label && <Badge variant="secondary" className="text-xs">{w.label}</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 mr-auto"
                  onClick={() => removeWhitelist.mutate(w.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Documents List ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> מסמכים במאגר ({activeDocs.length})
          </CardTitle>
          <CardDescription>סטטוס אינדוקס, מקור, וכמות chunks לכל מסמך</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>כותרת</TableHead>
                <TableHead>מקור</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>נוצר</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeDocs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {d.source_type === 'whatsapp' ? 'WhatsApp' : d.source_type === 'upload' ? 'העלאה' : d.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{d.chunk_count}</TableCell>
                  <TableCell>
                    {d.chunk_count > 0 ? (
                      <div className="flex items-center gap-1 text-emerald-600 text-xs">
                        <FileCheck className="h-3.5 w-3.5" /> מאונדקס
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-600 text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> מעבד
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(d.created_at), 'dd/MM HH:mm')}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isDemoMode} onClick={() => deleteDoc.mutate(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {activeDocs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    לא נמצאו מסמכים במאגר. העלה מסמך ראשון כדי להתחיל.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SectionDivider className="mt-2" />
    </div>
  );
}
