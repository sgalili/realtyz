import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Send, Mic, MicOff, Paperclip, Loader2, X, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const SUGGESTED_PROMPTS = [
  'כמה תומכים חדשים נוספו השבוע?',
  'נתח סנטימנט בתל אביב ב-7 הימים האחרונים',
  'מי 10 הלידים עם המעורבות הגבוהה ביותר?',
  'שלח הודעת WhatsApp למתלבטים בירושלים',
  'הצג קמפיינים פעילים עם CTR מעל 25%',
  'איזה נושא מקבל הכי הרבה התייחסות חיובית?',
  'תזמן פוסט פייסבוק למחר ב-09:00',
  'סכם את שיחות ה-WhatsApp של אתמול',
  'אילו ערים דורשות חיזוק מיידי?',
  'הפק דוח אסטרטגי לשבוע הקרוב',
];

interface AttachedFile {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

interface IntelMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

function useHebrewVoiceInput(onResult: (text: string) => void) {
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
      if (event.error !== 'aborted') toast.error('שגיאה בזיהוי קולי');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onResult]);

  return { isListening, toggle };
}

function AnimatedPlaceholder({ text, idx }: { text: string; idx: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    setPhase('in');
    requestAnimationFrame(() => {
      const c = containerRef.current?.offsetWidth ?? 0;
      const t = textRef.current?.scrollWidth ?? 0;
      setOverflow(Math.max(0, t - c));
    });
  }, [idx, text]);

  const needsScroll = overflow > 2;
  // Total visible time per suggestion = 6s. Phases: fade-in 350ms, hold/scroll, fade-out 500ms.
  const TOTAL_MS = 6000;
  const FADE_IN_MS = 350;
  const FADE_OUT_MS = 500;
  const HOLD_MS = TOTAL_MS - FADE_IN_MS - FADE_OUT_MS; // 5150ms visible & still readable
  // Slow marquee: take ~60% of hold to scroll, leaving 20% pre-scroll + 20% post-scroll dwell.
  const marqueeDuration = needsScroll ? HOLD_MS / 1000 : 0;

  // Schedule phase transitions
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), FADE_IN_MS);
    const t2 = setTimeout(() => setPhase('out'), FADE_IN_MS + HOLD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [idx, text]);

  // Final shifted position used both during marquee end and fade-out
  const finalShift = needsScroll ? `${overflow}px` : '0px';

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 flex items-center ps-1.5 pe-4 overflow-hidden"
      dir="rtl"
    >
      <span
        ref={textRef}
        className="text-[17px] text-muted-foreground/70 whitespace-nowrap inline-block"
        style={{
          opacity: phase === 'in' ? 0 : 1,
          transform: phase === 'out' ? `translateX(${finalShift})` : undefined,
          animation: phase === 'in'
            ? 'placeholderFadeIn 350ms ease-out forwards'
            : phase === 'out'
              ? 'placeholderFadeOut 500ms ease-in forwards'
              : needsScroll
                ? `placeholderMarqueeRTL ${marqueeDuration}s linear forwards`
                : undefined,
          ['--marquee-shift' as any]: finalShift,
        }}
      >
        {text}
      </span>
      <style>{`
        @keyframes placeholderFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes placeholderFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes placeholderMarqueeRTL {
          0% { transform: translateX(0); }
          20% { transform: translateX(0); }
          80% { transform: translateX(var(--marquee-shift)); }
          100% { transform: translateX(var(--marquee-shift)); }
        }
      `}</style>
    </div>
  );
}

export function SidebarIntelInput() {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reply, setReply] = useState<IntelMessage | null>(null);
  const [suggestionIdx, setSuggestionIdx] = useState(() => Math.floor(Math.random() * SUGGESTED_PROMPTS.length));
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  // Rotate suggestion every 6s when input is empty and not focused (matches placeholder cycle)
  useEffect(() => {
    if (input || isFocused) return;
    const id = setInterval(() => {
      setSuggestionIdx((i) => (i + 1) % SUGGESTED_PROMPTS.length);
    }, 6000);
    return () => clearInterval(id);
  }, [input, isFocused]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput(prev => (prev ? prev + ' ' + text : text));
  }, []);
  const { isListening, toggle: toggleVoice } = useHebrewVoiceInput(handleVoiceResult);

  const useSuggestion = () => {
    setInput(SUGGESTED_PROMPTS[suggestionIdx]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const next: AttachedFile[] = [];
    let processed = 0;
    selected.forEach((f) => {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name}: גודל הקובץ חורג מ-5MB`);
        processed += 1;
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        next.push({ name: f.name, size: f.size, type: f.type, dataUrl: typeof reader.result === 'string' ? reader.result : undefined });
        processed += 1;
        if (processed === selected.length) {
          setFiles(prev => [...prev, ...next]);
        }
      };
      reader.readAsDataURL(f);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && files.length === 0) || isLoading) return;

    let composed = text || 'נא לנתח את הקבצים המצורפים.';
    if (files.length > 0) {
      composed += `\n\n[קבצים מצורפים: ${files.map(f => `${f.name} (${(f.size / 1024).toFixed(1)}KB)`).join(', ')}]`;
    }
    composed += `\n\n[נתיב נוכחי: ${location.pathname}]`;

    setReply({ role: 'user', content: text || `שלחתי ${files.length} קבצים` });
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: { messages: [{ role: 'user', content: composed }] },
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        setReply({ role: 'assistant', content: data.error, isError: true });
      } else {
        const content = data?.content || data?.explanation || 'בוצע.';
        setReply({ role: 'assistant', content });
      }
      setInput('');
      setFiles([]);
    } catch (e) {
      setReply({ role: 'assistant', content: `שגיאה: ${e instanceof Error ? e.message : 'לא ידוע'}`, isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  const hasInput = input.trim().length > 0 || files.length > 0;

  return (
    <div className="border-t border-[hsl(0_0%_80%)] bg-gradient-to-b from-[hsl(0_0%_94%)] to-[hsl(0_0%_86%)] px-2 py-2 space-y-2" dir="rtl">
      {reply && (
        <div className={`text-[12px] rounded-lg px-2.5 py-1.5 max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap ${
          reply.role === 'user'
            ? 'bg-background/10 text-sidebar-foreground/80 border border-sidebar-border/40'
            : reply.isError
              ? 'bg-destructive/15 text-destructive-foreground border border-destructive/30'
              : 'bg-background text-foreground border border-sidebar-border/40'
        }`}>
          <span className="text-[9px] uppercase font-bold opacity-60 me-1">
            {reply.role === 'user' ? 'אתה' : 'מענה'}:
          </span>
          {reply.content}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-background border border-border/50 rounded-full px-2 py-0.5">
              <FileText className="h-2.5 w-2.5 text-primary" />
              <span className="truncate max-w-[80px]">{f.name}</span>
              <button onClick={() => removeFile(i)} className="hover:text-destructive">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* WhatsApp-style composer: pill input + circular action button */}
      <div className="flex items-end gap-1.5">
        {/* Input pill (right side in RTL) with paperclip inside */}
        <div className="flex-1 rounded-[23px] p-px shadow-sm bg-gradient-to-br from-[hsl(0_0%_45%)] to-[hsl(0_0%_60%)]">
          <div className="flex items-end gap-1 bg-background rounded-[22px] px-2 py-1 min-h-[40px]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="צרף קבצים"
            className="shrink-0 h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <Paperclip className="h-[18px] w-[18px] -rotate-45" />
          </button>
          <div className="relative flex-1 min-w-0">
            {!input && !isFocused && (
              <AnimatedPlaceholder
                text={isListening ? '🎙️ מקשיב...' : SUGGESTED_PROMPTS[suggestionIdx]}
                idx={suggestionIdx}
              />
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder=""
              disabled={isLoading}
              rows={1}
              dir="rtl"
              className="w-full text-[17px] min-h-[28px] h-7 py-1 px-1.5 resize-none bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:min-h-[28px] focus:h-auto max-h-32 text-foreground whitespace-nowrap overflow-x-auto"
            />
          </div>
          </div>
        </div>

        {/* Circular send/mic button (left side in RTL) - WhatsApp green */}
        <button
          type="button"
          onClick={hasInput ? sendMessage : toggleVoice}
          disabled={isLoading}
          title={hasInput ? 'שלח' : isListening ? 'הפסק הקלטה' : 'הקלט קול'}
          className={`shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-all ${
            isListening
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-[hsl(142_70%_45%)] text-white hover:bg-[hsl(142_70%_40%)] shadow-md'
          }`}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : hasInput ? (
            <Send className="h-[18px] w-[18px] -rotate-45" />
          ) : isListening ? (
            <MicOff className="h-[20px] w-[20px]" />
          ) : (
            <Mic className="h-[20px] w-[20px]" />
          )}
        </button>
      </div>
    </div>
  );
}
