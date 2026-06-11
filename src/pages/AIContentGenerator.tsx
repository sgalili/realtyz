import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Sparkles, Copy, CheckCircle2, Clock, Facebook, Instagram, Send, MessageCircle, Phone, AtSign, RefreshCw, Eye, Pencil, Trash2, Save } from 'lucide-react';
import { useState, type SVGProps } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { learnFromEdit } from '@/lib/learnFromEdit';

const SignalLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} className={`scale-120 ${props.className ?? ''}`}>
    <path d="M8.6 18.4 4 20l1.6-4.6A7.3 7.3 0 1 1 8.6 18.4Z" />
    <path d="M12 5.5h.01M15.6 6.7h.01M18 9.6h.01M18.3 13.3h.01M16.4 16.4h.01M5.7 12h.01M6.7 8.4h.01" />
  </svg>
);

const MessengerLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 12.4C4 7.8 7.7 4.2 12.2 4.2s7.8 3.3 7.8 7.6-3.6 7.6-8.1 7.6c-.9 0-1.8-.1-2.6-.4L6 20l.9-3.1A7.2 7.2 0 0 1 4 12.4Z" />
    <path d="m8.2 13.1 2.5-2.6 2.2 1.9 2.9-2.9" />
  </svg>
);

const WhatsAppLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} className={`scale-120 ${props.className ?? ''}`}>
    <path d="M4.8 19.2 6 15.7a7.5 7.5 0 1 1 2.7 2.7l-3.9.8Z" />
    <path d="M9.4 8.5c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.3 0 .5-.2.7l-.4.5c.7 1.3 1.6 2.2 3 2.9l.5-.4c.2-.2.5-.2.7-.1l1.5.7c.3.1.4.3.4.6v.4c0 .3-.1.6-.5.8-.5.3-1.2.5-2 .3-2.7-.7-5.7-3.6-6.4-6.3-.2-.8.1-1.3.5-1.6Z" />
  </svg>
);

const GmailLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M4.8 7.2v10.1c0 .6.5 1.1 1.1 1.1h2.2V10.6L12 13.5l3.9-2.9v7.8h2.2c.6 0 1.1-.5 1.1-1.1V7.2l-7.2 5.4-7.2-5.4Z" fill="currentColor" />
    <path d="M4.8 7.2 12 12.6l7.2-5.4v-.5c0-.8-.9-1.3-1.6-.8L12 10.1 6.4 5.9c-.7-.5-1.6 0-1.6.8v.5Z" fill="currentColor" opacity="0.82" />
  </svg>
);

const TikTokLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.45a8.16 8.16 0 0 0 4.77 1.52V6.55a4.85 4.85 0 0 1-1.84-.16Z" />
  </svg>
);

const XLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
  </svg>
);

const socialPlatforms = [
  { value: 'Facebook', label: 'Facebook', Icon: Facebook, className: 'text-social-facebook' },
  { value: 'Instagram', label: 'Instagram', Icon: Instagram, className: 'text-social-instagram' },
  { value: 'WhatsApp', label: 'WhatsApp', Icon: WhatsAppLogo, className: 'text-social-whatsapp' },
  { value: 'Telegram', label: 'Telegram', Icon: Send, className: 'text-social-telegram' },
  { value: 'SMS', label: 'SMS', Icon: Phone, className: 'text-social-sms' },
  { value: 'Messenger', label: 'Messenger', Icon: MessengerLogo, className: 'text-social-messenger' },
  { value: 'TikTok', label: 'TikTok', Icon: TikTokLogo, className: 'text-social-tiktok' },
  { value: 'X', label: 'X', Icon: XLogo, className: 'text-social-x' },
  { value: 'Signal', label: 'Signal', Icon: SignalLogo, className: 'text-social-signal' },
  { value: 'Email', label: 'Email', Icon: GmailLogo, className: 'text-social-email' },
];

type ContentLog = {
  id: string;
  topic: string | null;
  platform: string | null;
  generated_text: string | null;
  created_at: string | null;
};

const AIContentGenerator = () => {
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [generatedContent, setGeneratedContent] = useState('');
  const [originalGenerated, setOriginalGenerated] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [editingFinalizing, setEditingFinalizing] = useState(false);
  const [editingOriginal, setEditingOriginal] = useState('');
  const [copied, setCopied] = useState(false);
  const [openLog, setOpenLog] = useState<ContentLog | null>(null);
  const [editingLog, setEditingLog] = useState<ContentLog | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editContent, setEditContent] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const blockDemoAction = useDemoGuard();

  const finalizeText = async (params: {
    edited: string;
    original: string;
    context?: string;
    purpose?: 'social_post' | 'public_comment' | 'private_dm' | 'generic';
  }): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('finalize-text', {
        body: {
          edited_text: params.edited,
          original_text: params.original,
          context: params.context ?? '',
          purpose: params.purpose ?? 'social_post',
        },
      });
      if (error) throw error;
      const finalText = (data as any)?.final_text;
      if (typeof finalText !== 'string' || !finalText.trim()) {
        throw new Error((data as any)?.error || 'לא התקבלה גרסה סופית');
      }
      return finalText.trim();
    } catch (e: any) {
      toast.error(e?.message || 'יצירת גרסה סופית נכשלה');
      return null;
    }
  };

  const { data: logs, isLoading } = useQuery({
    queryKey: ['ai-content-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('ai_content_logs').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('generate-ai-content')) throw new Error('demo-blocked');
      const edgeFnUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-content`;
      const platform = platforms.join(', ');
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ topic, platform, platforms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'שגיאה ביצירת תוכן');
      if (data?.error) throw new Error(data.error);

      const content = data.content;

      const { error } = await supabase.from('ai_content_logs').insert({
        topic,
        platform,
        generated_text: content,
        created_by: user?.id,
      } as any);
      if (error) throw error;

      return { content, approvalId: data.approval_id as string | null };
    },
    onSuccess: ({ content, approvalId }) => {
      setGeneratedContent(content);
      setOriginalGenerated(content);
      queryClient.invalidateQueries({ queryKey: ['ai-content-logs'] });
      queryClient.invalidateQueries({ queryKey: ['approval-queue'] });
      toast.success(approvalId ? 'התוכן נוצר ונשלח לתור אישור אנושי' : 'התוכן נוצר בהצלחה!');
    },
    onError: (e) => { if (!(e instanceof Error) || e.message !== 'demo-blocked') toast.error(e instanceof Error ? e.message : 'יצירת התוכן נכשלה'); },
  });

  const updateLogMutation = useMutation({
    mutationFn: async () => {
      if (!editingLog) throw new Error('לא נבחר פריט לעריכה');
      const originalText = editingLog.generated_text || '';
      const { error } = await supabase
        .from('ai_content_logs')
        .update({ topic: editTopic, platform: editPlatform, generated_text: editContent } as any)
        .eq('id', editingLog.id);
      if (error) throw error;
      // Active-learning capture: train future generations on this manual edit.
      learnFromEdit({
        context: `ai_content_log:${editPlatform || 'unknown'}`,
        pairs: [{ label: 'generated_text', original: originalText, edited: editContent }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-content-logs'] });
      setEditingLog(null);
      toast.success('התוכן עודכן');
    },
    onError: (e: Error) => toast.error(e.message || 'עדכון התוכן נכשל'),
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_content_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-content-logs'] });
      toast.success('התוכן נמחק');
    },
    onError: (e: Error) => toast.error(e.message || 'מחיקת התוכן נכשלה'),
  });

  const startEditing = (log: ContentLog) => {
    setEditingLog(log);
    setEditTopic(log.topic || '');
    setEditPlatform(log.platform || '');
    setEditContent(log.generated_text || '');
    setEditingOriginal(log.generated_text || '');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    toast.success('הועתק ללוח!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">מחולל תוכן AI</h1>
        <p className="text-muted-foreground text-sm">יצירת תוכן קמפיין בעזרת AI - כל תוצאה עוברת אישור אנושי לפני פרסום</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> יצירת תוכן חדש
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic">נושא / אירוע</Label>
              <Input
                id="topic"
                placeholder="הזן נושא או אירוע"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>פלטפורמות</Label>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-9" dir="ltr">
                {socialPlatforms.map(({ value, label, Icon, className }) => {
                  const selected = platforms.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => setPlatforms((current) => selected ? current.filter((item) => item !== value) : [...current, value])}
                      className={`flex h-11 items-center justify-center rounded-md border bg-card transition-colors hover:bg-muted ${className} ${selected ? 'border-current ring-2 ring-current/20' : 'border-border/60 opacity-70'}`}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!topic || platforms.length === 0 || generateMutation.isPending}
              className="w-full"
            >
              <Sparkles className="h-4 w-4 ml-2" />
              {generateMutation.isPending ? 'מייצר...' : 'ייצר תוכן'}
            </Button>

            {generatedContent && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>תוצאה</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateMutation.mutate()}
                        disabled={!topic || platforms.length === 0 || generateMutation.isPending}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className={`h-3 w-3 ml-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                        {generateMutation.isPending ? 'מייצר...' : 'תוצאה אחרת'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs">
                        {copied ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <Copy className="h-3 w-3 ml-1" />}
                        {copied ? 'הועתק!' : 'העתק'}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={generatedContent}
                    onChange={(e) => setGeneratedContent(e.target.value)}
                    className="min-h-[200px] text-sm"
                  />
                  {generatedContent.trim() &&
                    originalGenerated.trim() &&
                    generatedContent.trim() !== originalGenerated.trim() && (
                      <div className="flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={finalizing}
                          onClick={async () => {
                            setFinalizing(true);
                            const aiBaseline = originalGenerated;
                            const userEdited = generatedContent;
                            const finalText = await finalizeText({
                              edited: userEdited,
                              original: aiBaseline,
                              context: [
                                topic ? `Topic: ${topic}` : null,
                                platforms.length ? `Platforms: ${platforms.join(', ')}` : null,
                              ]
                                .filter(Boolean)
                                .join('\n'),
                              purpose: 'social_post',
                            });
                            if (finalText) {
                              setGeneratedContent(finalText);
                              setOriginalGenerated(finalText);
                              // Active-learning: feed both the human edit and
                              // the final polish into the lexicon so future
                              // posts inherit Udi's corrections automatically.
                              learnFromEdit({
                                context: `ai_content_finalize:${platforms.join(',') || 'unknown'}`,
                                pairs: [
                                  { label: 'user_edit', original: aiBaseline, edited: userEdited },
                                  { label: 'final_polish', original: userEdited, edited: finalText },
                                ],
                              });
                              // Persist the polished version onto the most
                              // recent ai_content_logs row so the saved
                              // history reflects what Udi actually approved.
                              try {
                                const { data: latest } = await supabase
                                  .from('ai_content_logs')
                                  .select('id')
                                  .eq('created_by', user?.id)
                                  .order('created_at', { ascending: false })
                                  .limit(1)
                                  .maybeSingle();
                                if (latest?.id) {
                                  await supabase
                                    .from('ai_content_logs')
                                    .update({ generated_text: finalText } as any)
                                    .eq('id', latest.id);
                                  queryClient.invalidateQueries({ queryKey: ['ai-content-logs'] });
                                }
                              } catch { /* non-fatal */ }
                              toast.success('נוצרה גרסה סופית');
                            }
                            setFinalizing(false);
                          }}
                          className="h-8"
                        >
                          <Sparkles className={`h-3.5 w-3.5 ml-1 ${finalizing ? 'animate-pulse' : ''}`} />
                          {finalizing ? 'מנסח גרסה סופית...' : 'גרסה סופית'}
                        </Button>
                      </div>
                    )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> היסטוריית תוכן
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {isLoading && <p className="text-sm text-muted-foreground">טוען...</p>}
              {logs?.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground py-4 text-center">אין תוכן שנוצר עדיין</p>
              )}
              {logs?.map((log) => (
                <div key={log.id} className="p-3 rounded-lg border border-border/50 space-y-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{log.topic || 'ללא כותרת'}</span>
                    {log.platform && <Badge variant="secondary" className="text-[10px]">{log.platform}</Badge>}
                    <span className="text-[10px] text-muted-foreground mr-auto">
                      {log.created_at ? format(new Date(log.created_at), 'dd/MM HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{log.generated_text}</p>
                  <div className="flex justify-end gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpenLog(log)}>
                      <Eye className="h-3.5 w-3.5 ml-1" /> פתח
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => startEditing(log)}>
                      <Pencil className="h-3.5 w-3.5 ml-1" /> ערוך
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 ml-1" /> מחק
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader className="text-right">
                          <AlertDialogTitle>למחוק את התוכן?</AlertDialogTitle>
                          <AlertDialogDescription>הפעולה תמחק את הפריט מהיסטוריית התוכן.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 sm:justify-start">
                          <AlertDialogAction onClick={() => deleteLogMutation.mutate(log.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!openLog} onOpenChange={(open) => !open && setOpenLog(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>{openLog?.topic || 'תוכן שנוצר'}</DialogTitle>
          </DialogHeader>
          {openLog?.platform && <Badge variant="secondary" className="w-fit">{openLog.platform}</Badge>}
          <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {openLog?.generated_text}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingLog} onOpenChange={(open) => !open && setEditingLog(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>עריכת תוכן</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>נושא</Label>
              <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>פלטפורמה</Label>
              <Input value={editPlatform} onChange={(e) => setEditPlatform(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>תוכן</Label>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[260px]" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => updateLogMutation.mutate()} disabled={updateLogMutation.isPending}>
              <Save className="h-4 w-4 ml-2" /> שמור
            </Button>
            {editContent.trim() &&
              editingOriginal.trim() &&
              editContent.trim() !== editingOriginal.trim() && (
                <Button
                  variant="secondary"
                  disabled={editingFinalizing}
                  onClick={async () => {
                    setEditingFinalizing(true);
                    const finalText = await finalizeText({
                      edited: editContent,
                      original: editingOriginal,
                      context: [
                        editTopic ? `Topic: ${editTopic}` : null,
                        editPlatform ? `Platform: ${editPlatform}` : null,
                      ]
                        .filter(Boolean)
                        .join('\n'),
                      purpose: 'social_post',
                    });
                    if (finalText) {
                      setEditContent(finalText);
                      setEditingOriginal(finalText);
                      toast.success('נוצרה גרסה סופית');
                    }
                    setEditingFinalizing(false);
                  }}
                >
                  <Sparkles className={`h-4 w-4 ml-2 ${editingFinalizing ? 'animate-pulse' : ''}`} />
                  {editingFinalizing ? 'מנסח...' : 'גרסה סופית'}
                </Button>
              )}
            <Button variant="outline" onClick={() => setEditingLog(null)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIContentGenerator;
