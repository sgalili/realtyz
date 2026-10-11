import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { registerTutorialOpener, tutorialForPath, tutorialStore, useTutorialState, type Tutorial } from '@/lib/tutorials';

/** Renders **bold** keywords as highlighted text. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, k) => p.startsWith('**') ? <strong key={k} className="font-extrabold text-primary">{p.slice(2, -2)}</strong> : p)}</>;
}

/** Single dialog for all tutorials; auto-opens once per page on first visit. */
export function TutorialHost() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const st = useTutorialState();
  const [tut, setTut] = useState<Tutorial | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => { tutorialStore.setUser(user?.id); }, [user?.id]);
  useEffect(() => { registerTutorialOpener((t) => { setI(0); setTut(t); }); return () => registerTutorialOpener(null); }, []);
  useEffect(() => {
    if (!user) return;
    const t = tutorialForPath(pathname);
    if (!t) return;
    const s = tutorialStore.get();
    if (s.seen.includes(t.id) || s.dismissed.includes(t.id)) return;
    const timer = window.setTimeout(() => { setI(0); setTut(t); }, 600);
    return () => window.clearTimeout(timer);
  }, [pathname, user, st]);

  if (!tut) return null;
  const slide = tut.slides[i];
  const last = i === tut.slides.length - 1;
  const gotIt = () => { tutorialStore.markSeen(tut.id); setTut(null); };
  const never = () => { tutorialStore.dismiss(tut.id); setTut(null); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) gotIt(); }}>
      <DialogContent dir="rtl" className="max-w-md overflow-hidden p-0">
        <div className="bg-gradient-to-b from-primary/15 to-transparent px-6 pb-2 pt-8 text-center">
          <div className="mb-3 text-6xl" aria-hidden>{slide.emoji}</div>
          <p className="text-sm font-bold text-primary">{tut.title}</p>
          <DialogTitle className="mt-1 text-2xl font-extrabold">{slide.title}</DialogTitle>
        </div>
        <div className="space-y-3 px-6 pb-2 text-right">
          <DialogDescription className="text-lg leading-relaxed text-foreground"><Rich text={slide.body} /></DialogDescription>
          {slide.bullets && (
            <ul className="space-y-1.5">
              {slide.bullets.map((b) => <li key={b} className="rounded-lg bg-muted px-3 py-2.5 text-base leading-snug"><Rich text={b} /></li>)}
            </ul>
          )}
        </div>
        {tut.slides.length > 1 && (
          <div className="flex items-center justify-center gap-3 py-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="הקודם"><ChevronRight className="h-4 w-4" /></Button>
            <div className="flex gap-1.5">
              {tut.slides.map((_, k) => <span key={k} className={cn('h-2 rounded-full transition-all', k === i ? 'w-5 bg-primary' : 'w-2 bg-muted-foreground/30')} />)}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={last} onClick={() => setI(i + 1)} aria-label="הבא"><ChevronLeft className="h-4 w-4" /></Button>
          </div>
        )}
        <div className="space-y-2 px-6 pb-5 pt-2">
          {last ? <Button className="h-11 w-full text-base font-bold" onClick={gotIt}>הבנתי</Button> : <Button className="h-11 w-full text-base font-bold" onClick={() => setI(i + 1)}>הבא</Button>}
          <Button variant="ghost" onClick={never} className="w-full text-sm text-muted-foreground">אל תציג לי את זה יותר</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ❓ trigger; hidden once the user chose "אל תציג לי את זה יותר". */
export function HelpHint({ tutorial, path, className }: { tutorial?: Tutorial | null; path?: string; className?: string }) {
  const st = useTutorialState();
  const t = tutorial ?? (path ? tutorialForPath(path) : null);
  if (!t || st.dismissed.includes(t.id)) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`מדריך: ${t.title}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); import('@/lib/tutorials').then((m) => m.openTutorial(t)); }}
      className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary', className)}
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </Button>
  );
}
