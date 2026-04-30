import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame } from 'lucide-react';

// Hebrew stop words to filter out
const STOP_WORDS = new Set([
  'של', 'את', 'על', 'עם', 'לא', 'כל', 'גם', 'הוא', 'היא', 'אני', 'זה', 'זו', 'מה',
  'או', 'אם', 'כי', 'רק', 'עד', 'כן', 'לי', 'לו', 'לה', 'בו', 'בה', 'הם', 'הן',
  'יש', 'אין', 'היה', 'היו', 'אבל', 'אז', 'כמו', 'כבר', 'עוד', 'בין', 'אחרי',
  'לפני', 'מאוד', 'אותו', 'אותה', 'שלי', 'שלו', 'שלה', 'שלנו', 'שלהם',
  'the', 'is', 'a', 'an', 'and', 'or', 'to', 'in', 'for', 'it', 'you', 'we', 'he', 'she',
  'this', 'that', 'are', 'was', 'were', 'be', 'have', 'has', 'had', 'do', 'does',
  'not', 'but', 'from', 'with', 'at', 'by', 'on', 'can', 'will', 'just', 'so',
]);

const TrendingTopics = () => {
  const { data: topics } = useQuery({
    queryKey: ['trending-topics'],
    queryFn: async () => {
      // Pull recent messages from both tables
      const [{ data: msgs }, { data: chats }] = await Promise.all([
        supabase.from('messages').select('content').not('content', 'is', null).order('created_at', { ascending: false }).limit(500),
        supabase.from('chat_history').select('content').not('content', 'is', null).eq('role', 'user').order('created_at', { ascending: false }).limit(500),
      ]);

      const allTexts = [...(msgs ?? []), ...(chats ?? [])].map((m) => m.content ?? '');
      const wordCount = new Map<string, number>();

      for (const text of allTexts) {
        const words = text.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/);
        for (const raw of words) {
          const w = raw.trim().toLowerCase();
          if (w.length < 2 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
          wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
        }
      }

      return Array.from(wordCount.entries())
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([word, count]) => ({ word, count }));
    },
    refetchInterval: 60_000,
  });

  const maxCount = topics?.[0]?.count ?? 1;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Flame className="h-4 w-4 text-destructive" />
          נושאים בוערים בראשון לציון
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!topics || topics.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין מספיק הודעות לניתוח עדיין</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map(({ word, count }) => {
              const ratio = count / maxCount;
              const size = ratio > 0.7 ? 'text-lg font-bold' : ratio > 0.4 ? 'text-base font-semibold' : 'text-sm font-medium';
              const opacity = ratio > 0.7 ? 'opacity-100' : ratio > 0.4 ? 'opacity-80' : 'opacity-60';
              return (
                <span
                  key={word}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary ${size} ${opacity} transition-all`}
                  title={`${count} אזכורים`}
                >
                  {word}
                  <span className="text-[10px] font-normal text-muted-foreground">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TrendingTopics;
