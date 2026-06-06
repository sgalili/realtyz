import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Sparkles, Loader2, BarChart3, Database, X, Mic, MicOff, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--gold, 48 96% 53%))',
  'hsl(var(--destructive))',
  'hsl(var(--accent-foreground))',
];

// Real-estate quick command pills (פקודות מהירות) — 9 buttons
const DEFAULT_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: 'סיכום כללי', prompt: 'תן לי סיכום כללי של מצב המשרד: כמה מתעניינים, נכסים פעילים, וסנטימנט כללי.' },
  { label: 'בעיות דחופות', prompt: 'אילו מתעניינים או עסקאות דורשים טיפול מיידי השבוע?' },
  { label: 'הזדמנויות חמות', prompt: 'מהן ההזדמנויות הכי חמות בצנרת המכירות שלי כרגע?' },
  { label: 'נתוני מערכת', prompt: 'כמה לידים, נכסים פעילים, וקמפיינים יש במערכת?' },
  { label: 'תוכנית 24 שעות', prompt: 'בנה לי תוכנית פעולה ל-24 השעות הקרובות עבור התיק הפעיל.' },
  { label: 'ערים מובילות', prompt: 'מהן 5 הערים עם הכי הרבה מתעניינים פעילים בנכסים שלי?' },
  { label: 'מגמת סנטימנט', prompt: 'מהי מגמת הסנטימנט של הרוכשים הפוטנציאליים בשבוע האחרון?' },
  { label: 'מתלבטים לטיפול', prompt: 'מי המתעניינים המתלבטים שדורשים מגע נוסף כדי לקדם עסקה?' },
  { label: 'רוכשים פוטנציאליים', prompt: 'הצג לי את 10 הרוכשים הפוטנציאליים עם רמת המוכנות הגבוהה ביותר.' },
];

// Real-estate suggestion card groups shown in the empty state
const SUGGESTION_GROUPS: Array<{ title: string; prompts: string[] }> = [
  {
    title: 'בחר שאלה ספציפית בנושא "ערוצי שיווק נדל"ן":',
    prompts: [
      'הצג מגמה והשוואה לשבוע שעבר בנושא השוואת ערוצי פרסום נכסים.',
      'אילו 3 פעולות הכי משתלמות עכשיו בנושא גיוס בלעדיות בערוצים?',
    ],
  },
  {
    title: 'בחר שאלה ספציפית בנושא "גודל קהל רוכשים אופטימלי":',
    prompts: [
      'מה גודל הקהל שמייצר את ה-CTR הכי גבוה (פילוח לפי תקציב נכס 100/500/1000+)?',
      'תן לי סיכום מקוצר וחד על גודל קהל קונים אופטימלי באזור הביקוש.',
      'מה הפעולה המומלצת מיידית בנושא גודל קהל מתעניינים?',
      'הצג מגמה והשוואה לשבוע שעבר בנושא גודל קהל מתעניינים בנכס.',
      'אילו 3 פעולות הכי משתלמות עכשיו בנושא פילוח קהל יעד חם?',
    ],
  },
];

interface SourceTag {
  id: string;
  title: string;
  similarity: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any[];
  query?: string;
  type?: 'text' | 'data' | 'error';
  sources?: SourceTag[];
}

// Hebrew translations for common SQL/aggregate column names returned by ai-agent
const COLUMN_HE: Record<string, string> = {
  total_leads: 'סך מתעניינים',
  new_leads_count: 'מתעניינים חדשים',
  active_leads: 'מתעניינים פעילים',
  active_listings: 'נכסים פעילים',
  total_listings: 'סך נכסים',
  published_listings: 'נכסים שפורסמו',
  pending_listings: 'נכסים ממתינים',
  dominant_sentiment: 'סנטימנט שולט',
  sentiment: 'סנטימנט',
  avg_engagement: 'מעורבות ממוצעת',
  engagement_score: 'ציון מעורבות',
  loyalty_tier: 'דרגת נאמנות',
  full_name: 'שם מלא',
  phone_number: 'טלפון',
  city: 'עיר',
  status: 'סטטוס',
  lead_stage: 'שלב במשפך',
  deal_type: 'סוג עסקה',
  interest_tag: 'תחום עניין',
  property_title: 'שם הנכס',
  asking_price: 'מחיר מבוקש',
  created_at: 'נוצר ב',
  last_interaction_at: 'אינטראקציה אחרונה',
  count: 'כמות',
  total: 'סך הכל',
};
function translateColumn(key: string): string {
  return COLUMN_HE[key] ?? key.replace(/_/g, ' ');
}

// Detect if data can be charted
function isChartable(data: any[]): { type: 'bar' | 'pie'; labelKey: string; valueKey: string } | null {
  if (!data || data.length === 0 || data.length > 20) return null;
  const keys = Object.keys(data[0]);
  if (keys.length < 2) return null;
  const labelKey = keys.find(k => typeof data[0][k] === 'string');
  const valueKey = keys.find(k => typeof data[0][k] === 'number');
  if (!labelKey || !valueKey) return null;
  return { type: data.length <= 6 ? 'pie' : 'bar', labelKey, valueKey };
}

function InlineChart({ data, chartInfo }: { data: any[]; chartInfo: { type: 'bar' | 'pie'; labelKey: string; valueKey: string } }) {
  if (chartInfo.type === 'pie') {
    return (
      <div className="h-44 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={chartInfo.valueKey} nameKey={chartInfo.labelKey}
              cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false} fontSize={10}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-40 w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 60, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis type="category" dataKey={chartInfo.labelKey} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={55} />
          <Tooltip />
          <Bar dataKey={chartInfo.valueKey} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Voice-to-text hook using Web Speech API
function useVoiceInput(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggle = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('הדפדפן לא תומך בזיהוי קולי');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) onResult(transcript);
      setIsListening(false);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted') toast.error('שגיאה בזיהוי קולי: ' + event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onResult]);

  return { isListening, toggle };
}

export default function AiAgentDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Allow opening from header button
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-ai-drawer', handler);
    return () => window.removeEventListener('open-ai-drawer', handler);
  }, []);
  const quickActions = DEFAULT_ACTIONS;

  const handleVoiceResult = useCallback((text: string) => {
    setInput(prev => (prev ? prev + ' ' + text : text));
  }, []);

  const { isListening, toggle: toggleVoice } = useVoiceInput(handleVoiceResult);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const chatMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: { messages: chatMessages },
      });

      if (error) {
        throw new Error(error.message || 'שגיאה בקריאה ל-AI');
      }

      if (data?.error) {
        toast.error(data.error);
        setMessages(prev => [...prev, { role: 'assistant', content: data.error, type: 'error' }]);
      } else if (data?.type === 'data') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.explanation || 'הנה התוצאות:',
          data: data.data,
          query: data.query,
          type: 'data',
          sources: data.sources ?? [],
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data?.content || data?.explanation || 'לא הצלחתי לעבד את הבקשה',
          type: 'text',
          sources: data?.sources ?? [],
        }]);
      }
    } catch (e) {
      console.error('AI Agent error:', e);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `שגיאה: ${e instanceof Error ? e.message : 'Unknown error'}`,
        type: 'error',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Trigger is in AppLayout header */}
      <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col" dir="rtl">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-primary/5 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold">קצין המודיעין של Realtyz</h3>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-5 py-2">
              <div className="text-center space-y-2 pb-1">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">שלום! אני קצין המודיעין של Realtyz.</p>
                <p className="text-xs text-muted-foreground">שאל אותי כל שאלה על הנכסים, הקמפיינים והרוכשים שלך.</p>
              </div>
              {SUGGESTION_GROUPS.map((group, gi) => (
                <div key={gi} className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground px-1">{group.title}</p>
                  <div className="space-y-1.5">
                    {group.prompts.map((p, pi) => (
                      <button
                        key={pi}
                        type="button"
                        onClick={() => sendMessage(p)}
                        disabled={isLoading}
                        className="w-full text-right text-xs leading-relaxed rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors px-3 py-2.5 disabled:opacity-50"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : msg.type === 'error'
                    ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
                    : 'bg-muted rounded-tl-sm'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {(() => {
                      const chartInfo = isChartable(msg.data!);
                      if (chartInfo) return <InlineChart data={msg.data!} chartInfo={chartInfo} />;
                      return null;
                    })()}

                    <div className="overflow-x-auto max-h-48 rounded-lg border border-border/50 bg-background">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-muted/50">
                            {Object.keys(msg.data[0]).slice(0, 5).map(key => (
                              <th key={key} className="px-2 py-1.5 text-right font-medium text-muted-foreground whitespace-nowrap">{translateColumn(key)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msg.data.slice(0, 10).map((row: any, ri: number) => (
                            <tr key={ri} className="border-t border-border/30">
                              {Object.keys(row).slice(0, 5).map(key => (
                                <td key={key} className="px-2 py-1 whitespace-nowrap truncate max-w-[120px]">
                                  {row[key]?.toString() ?? '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {msg.data.length > 10 && (
                        <p className="text-[10px] text-muted-foreground text-center py-1">+ {msg.data.length - 10} שורות נוספות</p>
                      )}
                    </div>

                    {msg.query && (
                      <details className="text-[10px]">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Database className="h-2.5 w-2.5" /> הצג שאילתה
                        </summary>
                        <pre className="mt-1 p-2 rounded bg-background border border-border/50 overflow-x-auto font-mono" dir="ltr">
                          {msg.query}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      מקורות מבסיס הידע:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {msg.sources.map((src) => (
                        <button
                          key={src.id}
                          onClick={() => { setOpen(false); navigate('/knowledge'); }}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors max-w-[180px]"
                          title={`דמיון: ${(src.similarity * 100).toFixed(0)}%`}
                        >
                          <FileText className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-end">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">מנתח נתונים...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-2 border-t flex gap-2 overflow-x-auto">
          {quickActions.map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="text-[11px] h-7 whitespace-nowrap shrink-0 gap-1"
              onClick={() => sendMessage(action.prompt)}
              disabled={isLoading}
            >
              <Sparkles className="h-3 w-3" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Input — mic on right, slate send on left */}
        <div className="px-4 py-3 border-t">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex items-center gap-2"
          >
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0 bg-slate-700 hover:bg-slate-800 text-white"
              disabled={!input.trim() || isLoading}
              aria-label="שלח"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? '🎙️ מקשיב...' : 'מה הולכים לבדוק או לבצע בנכסים ובקמפיין?'}
              className="flex-1 h-9 text-sm"
              disabled={isLoading}
            />
            <Button
              type="button"
              size="icon"
              variant={isListening ? 'destructive' : 'outline'}
              className="h-9 w-9 shrink-0"
              onClick={toggleVoice}
              disabled={isLoading}
              title={isListening ? 'הפסק הקלטה' : 'הקלט קול'}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
