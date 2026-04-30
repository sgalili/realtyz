import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2, Send, Share2, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

type CandidatePage = {
  slug: string;
  candidate_name: string;
  headline: string;
  thesis: string;
  pillars: string[];
  mandate_goal: number;
  supporter_count: number;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const demoPage: CandidatePage = {
  slug: 'demo-candidate',
  candidate_name: 'Kalpiz Candidate',
  headline: 'קמפיין חכם שמקשיב לבוחרים ומתרגם אמון למנדטים',
  thesis: 'שילוב של מאגר ידע, שיחות AI וניתוח שטח בזמן אמת כדי להגיע לכל בוחר עם המסר הנכון.',
  pillars: ['שיחה אישית עם כל בוחר', 'מדידה יומית של תמיכה', 'מסרים חדים שמבוססים על ידע הקמפיין'],
  mandate_goal: 2,
  supporter_count: 18420,
};

export default function PublicListingPage() {
  const { slug = 'demo-candidate' } = useParams();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'שלום, אני סוכן ה-AI של הקמפיין. איך אפשר לעזור?' },
  ]);

  const { data: page } = useQuery({
    queryKey: ['public-candidate-page', slug],
    queryFn: async () => {
      if (slug === 'demo-candidate') return demoPage;
      const db = supabase as any;
      const { data, error } = await db.from('listings').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
      if (error) throw error;
      return (data ?? demoPage) as CandidatePage;
    },
  });

  const activePage = page ?? demoPage;
  const targetVotes = Math.max(1, activePage.mandate_goal * 30000);
  const progress = Math.min(100, Math.round((activePage.supporter_count / targetVotes) * 100));

  const shareUrl = useMemo(() => `${window.location.origin}/p/${activePage.slug}`, [activePage.slug]);

  useEffect(() => {
    document.title = `${activePage.candidate_name} | Kalpiz`;
    const description = activePage.headline.slice(0, 155);
    const setMeta = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(property.startsWith('og:') ? 'property' : 'name', property);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    setMeta('description', description);
    setMeta('og:title', `${activePage.candidate_name} | Kalpiz`);
    setMeta('og:description', description);
    setMeta('og:url', shareUrl);
    setMeta('og:type', 'website');
  }, [activePage, shareUrl]);

  const handleShare = async () => {
    if (navigator.share) await navigator.share({ title: activePage.candidate_name, text: activePage.headline, url: shareUrl });
    else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('הקישור הועתק');
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    const { data, error } = await supabase.functions.invoke('public-candidate-chat', {
      body: { slug: activePage.slug, messages: nextMessages },
    });
    setSending(false);
    setMessages([...nextMessages, { role: 'assistant', content: error ? 'מצטערים, הצ׳אט לא זמין כרגע.' : data.answer }]);
  };

  return (
    <div className="min-h-screen bg-secondary" dir="rtl">
      <section className="kalpiz-wave-section px-5 pb-24 pt-10 text-right">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <div className="text-sm font-black text-primary-foreground/80">Kalpiz</div>
          <h1 className="max-w-3xl text-4xl font-black leading-tight text-primary-foreground md:text-6xl">{activePage.candidate_name}</h1>
          <p className="max-w-3xl text-xl font-bold text-primary-foreground/95">{activePage.headline}</p>
          <Button onClick={handleShare} className="w-fit bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Share2 className="h-4 w-4" /> שתפו ב-WhatsApp
          </Button>
        </div>
      </section>

      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Card className="candidate-landing-card">
            <CardHeader><CardTitle>ה-Brief האסטרטגי</CardTitle></CardHeader>
            <CardContent className="space-y-5 text-right">
              <p className="text-base leading-7 text-foreground">{activePage.thesis}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {activePage.pillars.map((pillar) => (
                  <div key={pillar} className="rounded-lg border border-primary/15 bg-background/70 p-4 font-bold text-primary">{pillar}</div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="candidate-landing-card">
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> התקדמות למנדט</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Progress value={progress} className="h-5" />
              <p className="text-sm font-bold text-primary">{activePage.supporter_count.toLocaleString()} מתוך {targetVotes.toLocaleString()} קולות · {progress}%</p>
            </CardContent>
          </Card>
        </div>

        <Card className="candidate-landing-card h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> שאלו את ה-AI של הקמפיין</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[390px] space-y-3 overflow-y-auto rounded-lg bg-background/70 p-3">
              {messages.map((message, index) => (
                <div key={index} className={`rounded-lg p-3 text-sm ${message.role === 'user' ? 'mr-8 bg-primary text-primary-foreground' : 'ml-8 bg-secondary text-foreground'}`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ))}
              {sending && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>
            <div className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="שאלו שאלה על הקמפיין..." />
              <Button size="icon" onClick={sendMessage} disabled={sending}><Send className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}