import { useState } from 'react';
import { Network, Coins, Share2, Sparkles, Rocket, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dismissWelcome, welcomeDismissed } from '@/lib/welcomePreference';

const SLIDES = [
  { icon: Network, kicker: 'ברוכים הבאים ל־TORAFF', title: 'רשת שותפים מטורפת', text: 'כל הנכסים, כל השותפים, לוח אחד.' },
  { icon: Coins, kicker: 'עמלות חכמות', title: 'המוכר קובע עמלות', text: 'קונים ושוכרים משלמים פיקס פרייס.' },
  { icon: Share2, kicker: 'כולם שותפים', title: 'אצלנו כולם שותפים!', text: 'לא משנה אם אתה פרטי, מתווך או יזם – יש לך אזור שותף שבו מפרסמים נכסים של אחרים ומרוויחים עמלות בקלות.' },
  { icon: Sparkles, kicker: 'AI והפצה אוטומטית', title: 'מעלים נכס פעם אחת', text: 'וה־AI מפיץ אוטומטית לעשרות קבוצות, עונה לתגובות ומייצר לידים.' },
  { icon: Rocket, kicker: 'אוטומציות רווח', title: 'מוכנים לטירוף?', text: 'להרוויח כסף בצורה אוטומטית.' },
] as const;

export function hasSeenWelcomeSlides() {
  return welcomeDismissed();
}

export function WelcomeSlides({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const slide = SLIDES[index];
  const Icon = slide.icon;
  const last = index === SLIDES.length - 1;

  const finish = () => {
    setLeaving(true);
    window.setTimeout(onDone, 250);
  };

  return (
    <section
      dir="rtl"
      aria-roledescription="carousel"
      aria-label="היכרות עם TORAFF"
      className={cn('relative mx-4 mt-3 flex min-h-[calc(100%-1.5rem)] h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-3xl border bg-card transition-opacity duration-300 motion-reduce:transition-none', leaving && 'opacity-0')}
    >
      <Button type="button" variant="ghost" size="sm" onClick={finish} className="absolute left-3 top-3 z-10 gap-1 text-muted-foreground">
        דלג <X className="h-4 w-4" />
      </Button>

      <Icon aria-hidden="true" strokeWidth={0.6} className="pointer-events-none absolute -bottom-10 -left-10 h-[min(80vw,26rem)] w-[min(80vw,26rem)] text-primary/10" />

      <div key={index} className="relative flex flex-1 flex-col justify-center px-6 py-12 text-right animate-fade-in motion-reduce:animate-none" aria-live="polite">
        <span className="mb-3 text-sm font-bold text-primary">{slide.kicker}</span>
        <h2 className="font-['Assistant',sans-serif] text-4xl font-extrabold leading-tight text-foreground sm:text-6xl">{slide.title}</h2>
        <p className="mt-4 max-w-md text-lg font-medium text-muted-foreground sm:text-xl">{slide.text}</p>
        {last && (
          <Button type="button" onClick={finish} className="mt-8 h-14 w-full max-w-sm rounded-2xl text-lg font-extrabold">
            יאללה, נכנסים ללוח!
          </Button>
        )}
      </div>

      <Button dir="ltr" variant="link" className="relative self-center text-muted-foreground" onClick={() => { dismissWelcome(); finish(); }}>Don't show me again.</Button>
      <div className="relative flex items-center justify-between px-6 pb-6">
        <Button type="button" variant="ghost" size="icon" aria-label="הקודם" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button key={i} type="button" aria-label={`שקופית ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)} className={cn('h-2 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-2 bg-muted')} />
          ))}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="הבא" disabled={last} onClick={() => setIndex(index + 1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
    </section>
  );
}
