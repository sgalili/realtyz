import { useWalkthrough } from '@/lib/appWalkthrough';
import { useAppMode } from '@/hooks/useAppMode';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@/lib/router-compat';
import {
  Activity, BadgePercent, Building, Building2, CheckSquare2, ChevronLeft,
  ChevronRight, Compass, Globe2, Handshake, HelpCircle, Home,
  LayoutDashboard, Megaphone, MessagesSquare, Newspaper, Send, Share2,
  Trophy, UserPlus, UserRound, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  registerTutorialOpener, shouldAutoOpenTutorial, tutorialForPath, tutorialStore,
  useTutorialState, type Tutorial, type TutorialIcon,
} from '@/lib/tutorials';

const TUTORIAL_ICONS: Record<TutorialIcon, LucideIcon> = {
  guide: Compass,
  board: Globe2,
  tasks: CheckSquare2,
  dashboard: LayoutDashboard,
  campaigns: Megaphone,
  distribution: Send,
  leads: Users,
  users: UserPlus,
  properties: Building2,
  ads: Newspaper,
  commissions: BadgePercent,
  inbox: MessagesSquare,
  groups: UsersRound,
  deal: Handshake,
  affiliate: Share2,
  activity: Activity,
  developer: Building,
  wallet: Wallet,
  profile: UserRound,
  owner: Home,
  rewards: Trophy,
};

/** Renders **bold** keywords as highlighted text. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, k) => p.startsWith('**') ? <strong key={k} className="font-extrabold text-primary">{p.slice(2, -2)}</strong> : p)}</>;
}

/** Single dialog for all tutorials; automatic guides repeat until explicitly dismissed. */
export function TutorialHost() {
  const { user } = useAuth();
  const role = useUserRole();
  const { isPartnerMode } = useAppMode();
  const allowed = (t: Tutorial) => {
    if (role.loading || role.error) return false;
    if (role.isSuperAdmin) return true;
    const shared = ['page:/profile', 'page:/wallet', 'page:/public-listings'];
    if (isPartnerMode) return [...shared, 'page:/affiliate-network', 'page:/inbox', 'page:/campaigns', 'page:/referral'].includes(t.id);
    if (role.isPropertySeekerOnly) return shared.includes(t.id);
    if (role.isPropertyOwnerOnly) return [...shared, 'page:/owner/properties', 'page:/my-ads'].includes(t.id);
    if (role.isAffiliateOnly) return [...shared, 'page:/affiliate-network', 'page:/inbox', 'page:/campaigns', 'page:/referral'].includes(t.id);
    if (role.isDeveloper) return !['page:/properties', 'page:/deal-room', 'page:/dashboard'].includes(t.id);
    return role.isTeamMember;
  };
  const { pathname } = useLocation();
  const st = useTutorialState();
  const walkthrough = useWalkthrough();
  const [tut, setTut] = useState<Tutorial | null>(null);
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  const manualOpenRef = useRef(false);
  const autoEntryRef = useRef<string | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  useEffect(() => { tutorialStore.setUser(user?.id); }, [user?.id]);
  useEffect(() => {
    registerTutorialOpener((t) => {
      if (!allowed(t)) return;
      manualOpenRef.current = true;
      setManual(true);
      setI(0);
      setTut(t);
    });
    return () => registerTutorialOpener(null);
  }, [role.roles, role.loading, role.error, isPartnerMode]);
  useEffect(() => {
    if (!user) { autoEntryRef.current = null; return; }
    if (walkthrough || role.loading || role.error) return;
    const entryKey = `${user.id}:${pathname}`;
    if (autoEntryRef.current === entryKey) return;
    autoEntryRef.current = entryKey;
    if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    const t = tutorialForPath(pathname);
    if (!t || !allowed(t)) return;
    // Partner-page entry owns its consent-aware introduction; manual guides stay available.
    if (t.id === 'page:/affiliate-network') return;
    if (!shouldAutoOpenTutorial(tutorialStore.get(), t.id)) return;
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      if (window.location.pathname !== pathname || manualOpenRef.current) return;
      manualOpenRef.current = false;
      setManual(false);
      setI(0);
      setTut(t);
    }, 600);
  }, [pathname, user?.id, st, role.loading, role.error, walkthrough, isPartnerMode]);

  useEffect(() => () => {
    if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
  }, []);

  useEffect(() => {
    const dismiss = () => setTut(null);
    window.addEventListener('realtyz:walkthrough-active', dismiss);
    return () => window.removeEventListener('realtyz:walkthrough-active', dismiss);
  }, []);

  if (!tut || !allowed(tut) || walkthrough) return null;
  const slide = tut.slides[i];
  const SlideIcon = TUTORIAL_ICONS[slide.icon] ?? Compass;
  const last = i === tut.slides.length - 1;
  const close = () => { manualOpenRef.current = false; setManual(false); setTut(null); };
  const gotIt = () => { tutorialStore.markSeen(tut.id); close(); };
  const never = () => { tutorialStore.dismiss(tut.id); close(); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) gotIt(); }}>
      <DialogContent dir="rtl" className="max-w-md overflow-hidden p-0">
        <div className="px-6 pb-2 pt-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <SlideIcon className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <DialogTitle className="text-2xl font-extrabold">{slide.title}</DialogTitle>
        </div>
        <div className="space-y-3 px-6 pb-2 text-right">
          <DialogDescription className="text-lg leading-relaxed text-foreground"><Rich text={slide.body} /></DialogDescription>
          {slide.bullets && (
            <ul className="space-y-1.5">
              {slide.bullets.map((b) => <li key={b} className="py-1.5 text-lg leading-relaxed"><Rich text={b} /></li>)}
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
          {!manual && <Button variant="ghost" onClick={never} className="w-full text-sm text-muted-foreground">אל תציג לי את זה יותר</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Manual help stays available even when automatic guides are dismissed. */
export function HelpHint({ tutorial, path, className }: { tutorial?: Tutorial | null; path?: string; className?: string }) {
  const st = useTutorialState();
  const t = tutorial ?? (path ? tutorialForPath(path) ?? { id: `page:${path}`, title: 'עזרה', slides: [{ icon: 'guide' as const, title: 'הפעולות במסך', body: 'פותחים פריט לצפייה בפרטים. עריכה ושמירה זמינות דרך הפעולות המוצגות לצד הפריט.' }] } : null);
  if (!t) return null;
  // Explicitly suppressed guides stay clickable, only the icon fades to a lighter gray.
  const suppressed = st.dismissed.includes(t.id);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`מדריך: ${t.title}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); import('@/lib/tutorials').then((m) => m.openTutorial(t)); }}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors',
        suppressed
          ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          : 'text-primary/70 hover:bg-primary/10 hover:text-primary',
        className,
      )}
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </Button>
  );
}
