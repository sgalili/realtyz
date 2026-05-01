import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, FileText, Trash2, Phone, Plus, CheckCircle2, Loader2, FileCheck,
  Image, Video, Mic, BarChart3, MessageSquareText, Sparkles, Brain, RefreshCw, BookOpen,
} from 'lucide-react';
import { SectionDivider } from '@/components/SectionDivider';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { getDemoCandidateKnowledgeDocuments, getDemoCandidateSurveyInsights } from '@/lib/demoData';
import * as XLSX from 'xlsx';
import { WhatsAppConversationImporter } from '@/components/strategybank/WhatsAppConversationImporter';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const blockDemoAction = useDemoGuard();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [surveyFile, setSurveyFile] = useState<File | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [waLabel, setWaLabel] = useState('');

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

  const { data: surveyInsights = [] } = useQuery({
    queryKey: ['survey-insights', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('survey_insights')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

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

  const analyzeSurvey = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('analyze-survey')) throw new Error('demo-blocked');
      if (!surveyFile) throw new Error('יש לבחור קובץ סקר');
      const workbook = XLSX.read(await surveyFile.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rows.length === 0) throw new Error('לא נמצאו שורות בקובץ');
      const { error } = await supabase.functions.invoke('survey-analyze', {
        body: { title: surveyFile.name.replace(/\.[^.]+$/, ''), source_filename: surveyFile.name, rows },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSurveyFile(null);
      qc.invalidateQueries({ queryKey: ['survey-insights'] });
      toast.success('ניתוח הסקר הושלם ונוסף לדשבורד');
    },
    onError: (e: Error) => { if (e.message !== 'demo-blocked') toast.error(e.message); },
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
          toast.error(`כשל בטעינת ${file.name}: ${e.message}`);
        }
      }
      setIngesting(false);
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    [qc]
  );

  const demoDocuments = [
    { id: 'demo-1', title: 'מצע רשמי - מכירות 2026.pdf', type: 'PDF', chunks: 142 },
    { id: 'demo-2', title: 'נאום פתיחת קמפיין - חזון העיר.docx', type: 'DOCX', chunks: 38 },
    { id: 'demo-3', title: 'דף מסרים: כלכלה ודיור', type: 'PDF', chunks: 24 },
    { id: 'demo-4', title: 'תגובות רשמיות לאירועי ביטחון', type: 'DOCX', chunks: 31 },
  ];
  const coreValues = ['מנהיגות אחראית', 'שקיפות', 'ציונות', 'חדשנות'];
  const qaPairs = [
    {
      q: 'מה עמדתנו על פתיחת עסקים בשבת?',
      a: 'הנכס דוגל בסטטוס קוו תוך כבוד הדדי וחיזוק המרחב הקהילתי, עם מתן מענה לצרכים מקומיים ללא פגיעה באופי השכונות.',
    },
    {
      q: 'איך נתמודד עם יוקר הדיור בעיר?',
      a: 'תוכנית רב שנתית להאצת היתרי בנייה, שיווק קרקעות לצעירים, ושיתופי פעולה עם המגזר הפרטי לדיור בר השגה.',
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">מאגר הידע</h1>
        <p className="text-sm text-muted-foreground mt-1">
          הזן מסמכים והודעות WhatsApp למוח של סוכן ה-AI. כל ידע מומר לווקטורים סמנטיים לחיפוש מדויק.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => fileInputRef.current?.click()}>
          <Plus className="h-4 w-4" /> הוסף מקור ידע חדש
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> מקורות ידע פעילים
            </CardTitle>
            <CardDescription>הספרייה שמזינה את מוח ה-AI של הקמפיין</CardDescription>
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
          <CardDescription>כך ה-AI עונה על שאלות לידים בהתבסס על המסמכים שהוזנו</CardDescription>
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

      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList>
          <TabsTrigger value="knowledge"><Upload className="h-4 w-4 ml-2" /> מסמכי ידע</TabsTrigger>
          <TabsTrigger value="surveys"><BarChart3 className="h-4 w-4 ml-2" /> מודיעין סקרים</TabsTrigger>
        </TabsList>
        <TabsContent value="knowledge" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> העלאת מסמכים
              </CardTitle>
              <CardDescription>PDF, TXT, Markdown, תמונות, וידאו והודעות קוליות - גרור ושחרר או לחץ למכירה</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/30'}`}
              >
                <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,image/*,video/*,audio/*,text/plain,text/markdown,application/pdf" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                {ingesting ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm">מעבד ומטמיע ב-pgvector...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium">גרור קבצים לכאן או לחץ למכירה</p>
                    <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> מסמכים</span>
                      <span className="inline-flex items-center gap-1"><Image className="h-3 w-3" /> תמונות</span>
                      <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> וידאו</span>
                      <span className="inline-flex items-center gap-1"><Mic className="h-3 w-3" /> אודיו</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="surveys" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> העלאת סקר Excel/CSV</CardTitle>
              <CardDescription>ה-AI מזהה סנטימנט לפי עיר/אזור, נקודות חולשה, מתלבטים והמלצות מסר ל-WhatsApp/SMS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setSurveyFile(e.target.files?.[0] ?? null)} />
              <Button onClick={() => analyzeSurvey.mutate()} disabled={!surveyFile || analyzeSurvey.isPending}>
                {analyzeSurvey.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                נתח סקר והוסף לתובנות
              </Button>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(isDemoMode ? getDemoCandidateSurveyInsights(demoCandidateId) : surveyInsights).map((insight) => (
              <Card key={insight.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{insight.title}</CardTitle>
                  <CardDescription>{insight.row_count} שורות · {format(new Date(insight.created_at), 'dd/MM HH:mm')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{insight.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(insight.top_concerns) && insight.top_concerns.slice(0, 4).map((item: any, index: number) => (
                      <Badge key={index} variant="secondary">{item.label ?? item.concern ?? String(item)}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
                    אין מסמכים. התחל בהעלאה או שלח הודעה עם <code>/kb</code> ב-WhatsApp.
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
