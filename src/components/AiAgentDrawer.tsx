import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Sparkles, Loader2, BarChart3, Database, X, Mic, MicOff, FileText, ChevronDown, ChevronLeft, Paperclip, Globe, MessageCircle } from 'lucide-react';
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

// 10 topics. Each expands to 3 best follow-up prompts (used both in the empty
// state and in the quick-actions bar at the bottom).
const TOPICS: Array<{ label: string; prompts: string[] }> = [
  { label: 'סיכום כללי', prompts: [
    'תן לי סיכום כללי של מצב המשרד: כמה מתעניינים, נכסים פעילים, וסנטימנט כללי.',
    'מה השתנה בתיק שלי מאז אתמול?',
    'תן לי תקציר KPI שבועי במשפט אחד לכל מדד.',
  ]},
  { label: 'בעיות דחופות', prompts: [
    'אילו מתעניינים או עסקאות דורשים טיפול מיידי השבוע?',
    'אילו מתעניינים לא קיבלו מענה מעל 48 שעות?',
    'אילו נכסים נמצאים בסיכון להחמצה השבוע?',
  ]},
  { label: 'הזדמנויות חמות', prompts: [
    'מהן ההזדמנויות הכי חמות בצנרת המכירות שלי כרגע?',
    'מי 5 המתעניינים עם המוכנות הגבוהה ביותר לסגירה?',
    'אילו נכסים מתאימים ליותר מ-3 מתעניינים פעילים?',
  ]},
  { label: 'תוכנית 24 שעות', prompts: [
    'בנה לי תוכנית פעולה ל-24 השעות הקרובות עבור התיק הפעיל.',
    'לאיזה מתעניין כדאי לי להתקשר ראשון מחר בבוקר?',
    'אילו הודעות AI כדאי לאשר היום מתוך תור האישורים?',
  ]},
  { label: 'נתוני מערכת', prompts: [
    'כמה לידים, נכסים פעילים וקמפיינים יש במערכת?',
    'מה התפלגות המתעניינים לפי שלב במשפך?',
    'מהי התפלגות סוגי העסקה (מכירה מול שכירות)?',
  ]},
  { label: 'ערים מובילות', prompts: [
    'מהן 5 הערים עם הכי הרבה מתעניינים פעילים בנכסים שלי?',
    'באילו ערים יש לי הכי הרבה נכסים פעילים?',
    'באיזו עיר אחוז ההמרה ממתעניין לעסקה הוא הגבוה ביותר?',
  ]},
  { label: 'מגמת סנטימנט', prompts: [
    'מהי מגמת הסנטימנט של הרוכשים הפוטנציאליים בשבוע האחרון?',
    'אילו מתעניינים הראו ירידה חדה בסנטימנט לאחרונה?',
    'מה הגורם העיקרי לסנטימנט שלילי בשיחות האחרונות?',
  ]},
  { label: 'מתלבטים לטיפול', prompts: [
    'מי המתעניינים המתלבטים שדורשים מגע נוסף כדי לקדם עסקה?',
    'הצע לי הודעת מעקב מותאמת אישית לכל מתלבט.',
    'אילו מתלבטים נמצאים מעל 14 יום בלי התקדמות?',
  ]},
  { label: 'ערוצי שיווק', prompts: [
    'הצג מגמה והשוואה לשבוע שעבר בנושא ערוצי פרסום נכסים.',
    'אילו 3 פעולות הכי משתלמות עכשיו בגיוס בלעדיות בערוצים?',
    'איזה ערוץ מביא את הלידים האיכותיים ביותר החודש?',
  ]},
  { label: 'קהל יעד אופטימלי', prompts: [
    'מה גודל הקהל שמייצר את ה-CTR הגבוה ביותר (פילוח לפי תקציב נכס 100/500/1000+)?',
    'תן לי סיכום קצר וחד על גודל קהל קונים אופטימלי באזור הביקוש.',
    'הצג מגמה והשוואה לשבוע שעבר בגודל קהל מתעניינים בנכס.',
  ]},
];

interface SourceTag {
  id: string;
  title: string;
  similarity: number;
  source?: string;
  source_type?: string | null;
  file_path?: string | null;
  source_url?: string | null;
}

interface ResearchSource {
  url: string;
  title?: string;
}

interface WebtivResult {
  id: string;
  title: string;
  price: number;
  city: string;
  rooms: number;
  sqm: number;
  floor: number;
  photo: string | null;
  agent: string | null;
  transaction_type: 'sale' | 'rent';
  source_url: string | null;
}

interface Attachment {
  name: string;
  mime: string;
  data_url: string;
  size: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any[];
  query?: string;
  type?: 'text' | 'data' | 'error';
  sources?: SourceTag[];
  research_sources?: ResearchSource[];
  webtiv_results?: WebtivResult[];
  attachments?: Array<{ name: string; mime: string }>;
  // When ai-agent auto-creates a lead this turn, we stash the recipient phone
  // so per-property "Send WhatsApp Offer" buttons know where to route.
  recipient_phone?: string | null;
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
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<number | null>(null);
  // NOTE: quick-action pill bar was removed from the composer — we still keep
  // the topic accordion in the empty state above.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [researchMode, setResearchMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allow opening from header button
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-ai-drawer', handler);
    return () => window.removeEventListener('open-ai-drawer', handler);
  }, []);

  const onFilePick = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).slice(0, 6);
    arr.forEach((f) => {
      if (f.size > 18 * 1024 * 1024) {
        toast.error(`${f.name}: גדול מ-18MB`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;
        setPendingAttachments((prev) => [
          ...prev,
          { name: f.name, mime: f.type || 'application/octet-stream', data_url: dataUrl, size: f.size },
        ]);
      };
      reader.readAsDataURL(f);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Load full chat history for this user (permanent — never forgets).
  useEffect(() => {
    if (!user?.id || historyLoaded) return;
    (async () => {
      const { data, error } = await supabase
        .from('ai_drawer_history')
        .select('role, content, payload, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (!error && data) {
        setMessages(data.map((r: any) => ({
          role: r.role,
          content: r.content,
          ...(r.payload ?? {}),
        })) as Message[]);
      }
      setHistoryLoaded(true);
    })();
  }, [user?.id, historyLoaded]);


  const persistMessage = useCallback(async (m: Message) => {
    if (!user?.id) return;
    const { role, content, ...rest } = m;
    await supabase.from('ai_drawer_history').insert([{
      user_id: user.id,
      role,
      content,
      payload: rest as any,
    }]);
  }, [user?.id]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput(prev => (prev ? prev + ' ' + text : text));
  }, []);

  const { isListening, toggle: toggleVoice } = useVoiceInput(handleVoiceResult);

  // Auto-scroll to the bottom whenever new messages arrive AND when the
  // drawer is (re-)opened, so the operator lands on the freshest turn.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    // Defer to next frame so layout is measured after the sheet opens.
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, open, historyLoaded]);


  // Mint a share token via edge fn, then open a pre-filled WhatsApp message
  // to the recipient with the shared property link. Works for both local
  // listings (r.id looks like a UUID) and external Webtiv/Homely results
  // (we send an external_snapshot instead).
  const sendPropertyOffer = useCallback(async (r: WebtivResult, recipientPhone: string | null) => {
    const phone = (recipientPhone || '').replace(/\D/g, '');
    if (!phone) {
      toast.error('חסר מספר טלפון של המתעניין');
      return;
    }
    const normalized = phone.startsWith('972') ? phone
      : phone.startsWith('0') ? '972' + phone.slice(1) : phone;
    try {
      const isUuid = /^[0-9a-f-]{36}$/i.test(r.id);
      const payload: any = { lead_phone: normalized };
      if (isUuid) {
        payload.listing_id = r.id;
      } else {
        payload.external_snapshot = {
          property_title: r.title,
          asking_price: r.price,
          city: r.city,
          rooms: r.rooms,
          sqm: r.sqm,
          floor: r.floor,
          deal_type: r.transaction_type,
          media_photos: r.photo ? [r.photo] : [],
          source_url: r.source_url,
        };
      }
      const { data, error } = await supabase.functions.invoke('create-property-share', {
        body: payload,
      });
      if (error) throw error;
      const token = (data as any)?.token;
      if (!token) throw new Error('לא התקבל טוקן שיתוף');
      const shareUrl = `${window.location.origin}/share/property/${token}`;
      const priceStr = r.price
        ? `₪${r.price.toLocaleString('he-IL')}${r.transaction_type === 'rent' ? '/חודש' : ''}`
        : 'לפרטים';
      const msg =
`שלום 👋
מצאתי עבורך נכס שאני חושב שיעניין אותך:

🏠 ${r.title}
📍 ${r.city || ''}${r.rooms ? ` · ${r.rooms} חד׳` : ''}${r.sqm ? ` · ${r.sqm} מ״ר` : ''}
💰 ${priceStr}

לצפייה מלאה עם תמונות ופרטים:
${shareUrl}

מוזמנ/ת להגיב כאן ואחזור אליך.`;
      const wa = `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
      window.open(wa, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e?.message ?? 'שליחת ההצעה נכשלה');
    }
  }, []);

  const sendMessage = async (text: string) => {
    const hasFiles = pendingAttachments.length > 0;
    if ((!text.trim() && !hasFiles) || isLoading) return;

    const sentAttachments = pendingAttachments;
    const userMsg: Message = {
      role: 'user',
      content: text || (hasFiles ? `(נשלחו ${sentAttachments.length} קבצים לניתוח)` : ''),
      attachments: sentAttachments.map((a) => ({ name: a.name, mime: a.mime })),
    };
    setMessages(prev => [...prev, userMsg]);
    persistMessage(userMsg);
    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);

    try {
      const chatMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          messages: chatMessages,
          attachments: sentAttachments.map((a) => ({ name: a.name, mime: a.mime, data_url: a.data_url })),
          enable_research: researchMode ? true : undefined,
        },
      });

      if (error) {
        throw new Error(error.message || 'שגיאה בקריאה ל-AI');
      }

      let assistantMsg: Message;
      if (data?.error) {
        toast.error(data.error);
        assistantMsg = { role: 'assistant', content: data.error, type: 'error' };
      } else if (data?.type === 'data') {
        assistantMsg = {
          role: 'assistant',
          content: data.explanation || 'הנה התוצאות:',
          data: data.data,
          query: data.query,
          type: 'data',
          sources: data.sources ?? [],
          research_sources: data.research_sources ?? [],
          webtiv_results: data.webtiv_results ?? [],
          recipient_phone: data.created_lead?.phone_number ?? data.recipient_phone ?? null,
        };
      } else {
        assistantMsg = {
          role: 'assistant',
          content: data?.content || data?.explanation || 'לא הצלחתי לעבד את הבקשה',
          type: 'text',
          sources: data?.sources ?? [],
          research_sources: data?.research_sources ?? [],
          webtiv_results: data?.webtiv_results ?? [],
          recipient_phone: data?.created_lead?.phone_number ?? data?.recipient_phone ?? null,
        };
      }
      setMessages(prev => [...prev, assistantMsg]);
      persistMessage(assistantMsg);
    } catch (e) {
      console.error('AI Agent error:', e);
      const errMsg: Message = {
        role: 'assistant',
        content: `שגיאה: ${e instanceof Error ? e.message : 'Unknown error'}`,
        type: 'error',
      };
      setMessages(prev => [...prev, errMsg]);
      persistMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Trigger is in AppLayout header */}
      <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col" dir="rtl">
        {/* Header — centered brand mark + title */}
        <div className="px-4 py-3 border-b bg-primary/5 flex flex-col items-center justify-center gap-1.5">
          <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-center">קצין המודיעין של Realtyz</h3>
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
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground px-1">בחר נושא לקבלת 3 שאלות מומלצות:</p>
                {TOPICS.map((topic, ti) => {
                  const isOpen = expandedTopic === ti;
                  return (
                    <div key={ti} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTopic(isOpen ? null : ti)}
                        className="w-full flex items-center justify-between text-right px-3 py-2.5 text-xs font-medium hover:bg-primary/5 transition-colors"
                      >
                        <span>{topic.label}</span>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      {isOpen && (
                        <div className="border-t border-border/50 bg-background/50 p-2 space-y-1.5">
                          {topic.prompts.map((p, pi) => (
                            <button
                              key={pi}
                              type="button"
                              onClick={() => sendMessage(p)}
                              disabled={isLoading}
                              className="w-full text-right text-[11px] leading-relaxed rounded-lg border border-border/60 bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors px-2.5 py-2 disabled:opacity-50"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                  <div className="mt-3 pt-2 border-t border-border/30 space-y-2">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      מקורות מבסיס הידע:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {msg.sources.map((src) => {
                        const isAudio = src.source_type === 'audio';
                        const isVideo = src.source_type === 'video';
                        // Resolve a playable/openable URL:
                        //  1. external URL captured in source_metadata.source_url (YouTube, Drive, etc)
                        //  2. storage path in the `knowledge-files` bucket via public URL
                        let resolvedUrl: string | null = src.source_url ?? null;
                        if (!resolvedUrl && src.file_path) {
                          resolvedUrl = supabase.storage
                            .from('knowledge-files')
                            .getPublicUrl(src.file_path).data.publicUrl ?? null;
                        }
                        const label = src.title || 'מקור';
                        const title = `${src.source ?? 'Reference'} · דמיון: ${(src.similarity * 100).toFixed(0)}%`;
                        if (isAudio && resolvedUrl) {
                          return (
                            <div
                              key={src.id}
                              className="w-full flex items-center gap-2 text-[10px] px-2 py-1 rounded-md bg-primary/10 border border-primary/20"
                              title={title}
                            >
                              <FileText className="h-2.5 w-2.5 text-primary shrink-0" />
                              <span className="truncate max-w-[140px] text-primary">{label}</span>
                              <audio src={resolvedUrl} controls preload="none" className="h-7 flex-1 min-w-0" />
                            </div>
                          );
                        }
                        const commonCls =
                          'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors max-w-[220px]';
                        if (resolvedUrl) {
                          return (
                            <a
                              key={src.id}
                              href={resolvedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={commonCls}
                              title={title}
                            >
                              <FileText className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">
                                {isVideo ? '▶ ' : ''}{label}
                              </span>
                            </a>
                          );
                        }
                        return (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => { setOpen(false); navigate('/knowledge'); }}
                            className={commonCls}
                            title={title}
                          >
                            <FileText className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && msg.research_sources && msg.research_sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" /> מקורות מחקר חי:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {msg.research_sources.slice(0, 8).map((rs, ri) => (
                        <a
                          key={ri}
                          href={rs.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors max-w-[200px]"
                          title={rs.url}
                        >
                          <Globe className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{rs.title || rs.url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && msg.webtiv_results && msg.webtiv_results.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/30">
                    <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" />
                      תוצאות חיות מהשוק (Homely / Webtiv2):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {msg.webtiv_results.slice(0, 6).map((r) => {
                        const priceStr = r.price
                          ? `₪${r.price.toLocaleString('he-IL')}${r.transaction_type === 'rent' ? '/חודש' : ''}`
                          : '—';
                        return (
                          <div key={r.id} className="rounded-lg border border-border/60 bg-background overflow-hidden">
                            {r.source_url ? (
                              <a href={r.source_url} target="_blank" rel="noreferrer" className="block hover:opacity-90 transition-opacity">
                                {r.photo ? (
                                  <img
                                    src={r.photo}
                                    alt={r.title}
                                    loading="lazy"
                                    className="w-full h-20 object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">אין תמונה</div>
                                )}
                              </a>
                            ) : r.photo ? (
                              <img
                                src={r.photo}
                                alt={r.title}
                                loading="lazy"
                                className="w-full h-20 object-cover"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-20 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">אין תמונה</div>
                            )}
                            <div className="p-1.5 space-y-1">
                              <p className="text-[10px] font-semibold leading-tight line-clamp-2">{r.title}</p>
                              <p className="text-[10px] text-primary font-bold tabular-nums">{priceStr}</p>
                              <p className="text-[9px] text-muted-foreground">
                                {[r.rooms ? `${r.rooms} חד׳` : '', r.sqm ? `${r.sqm} מ״ר` : '', r.city].filter(Boolean).join(' · ')}
                              </p>
                              {msg.recipient_phone && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full h-6 mt-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]"
                                  onClick={() => sendPropertyOffer(r, msg.recipient_phone ?? null)}
                                  title="שלח הצעת נכס ב-WhatsApp"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  שלח ב-WhatsApp
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}



                {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {msg.attachments.map((a, ai) => (
                      <span key={ai} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
                        <Paperclip className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[140px]">{a.name}</span>
                      </span>
                    ))}
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

        {/* Quick-Actions pill bar removed by design — suggestions live in the
            empty-state topic list at the top of the transcript only. */}

        {/* Attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-1.5 border-t">
            {pendingAttachments.map((a, ai) => (
              <span key={ai} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border">
                <Paperclip className="h-2.5 w-2.5" />
                <span className="truncate max-w-[140px]">{a.name}</span>
                <button onClick={() => setPendingAttachments((p) => p.filter((_, i) => i !== ai))} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input — mic on right, slate send on left */}
        <div className="px-4 py-3 border-t">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => onFilePick(e.target.files)}
          />
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex items-center gap-2"
          >
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0 bg-slate-700 hover:bg-slate-800 text-white"
              disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading}
              aria-label="שלח"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? '🎙️ מקשיב...' : researchMode ? 'מצב מחקר חי - שאל על שכונה/אזור/פרויקט' : 'מה הולכים לבדוק או לבצע בנכסים ובקמפיין?'}
              className="flex-1 h-9 text-sm"
              disabled={isLoading}
            />
            <Button
              type="button"
              size="icon"
              variant={researchMode ? 'default' : 'outline'}
              className="h-9 w-9 shrink-0"
              onClick={() => setResearchMode((v) => !v)}
              disabled={isLoading}
              title={researchMode ? 'כבה מצב מחקר חי' : 'הפעל מצב מחקר חי (Firecrawl)'}
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="צרף קבצים (PDF/תמונות)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
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
