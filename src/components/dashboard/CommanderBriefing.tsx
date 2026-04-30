import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';

interface Props {
  topCity?: string;
  totalVoters: number;
  positivePercent: number;
}

const BRIEFINGS = [
  (city: string, pct: number) => `ג׳נרל, גייסנו בהצלחה את ${city}. מעורבות במחוז המרכז עומדת כרגע על ${pct}%.`,
  (city: string, pct: number) => `דיווח שטח: ${city} מגיבה. אחוז תמיכה חיובית: ${pct}%. ממשיכים בפריסה.`,
  (city: string, pct: number) => `מודיעין מעודכן: פעילות ב${city} בשיא. סנטימנט חיובי: ${pct}%. המשימה מתקדמת.`,
];

export function CommanderBriefing({ topCity, totalVoters, positivePercent }: Props) {
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    if (!topCity) return;
    const idx = Math.floor(Date.now() / 60000) % BRIEFINGS.length;
    const fullText = BRIEFINGS[idx](topCity, positivePercent);
    let i = 0;
    setTyping(true);
    setText('');
    const interval = setInterval(() => {
      i++;
      setText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        setTyping(false);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [topCity, positivePercent]);

  if (!topCity) return null;

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 max-w-sm animate-fade-in">
      <div className="h-7 w-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Shield className="h-4 w-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-amber-500 tracking-wider uppercase mb-1">דיווח מפקד AI</p>
        <p className="text-xs leading-relaxed text-foreground">
          {text}
          {typing && <span className="inline-block w-1.5 h-3.5 bg-amber-500 animate-pulse ml-0.5 align-text-bottom" />}
        </p>
      </div>
    </div>
  );
}
