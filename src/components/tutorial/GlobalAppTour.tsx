import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLocation, useNavigate } from '@/lib/router-compat';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './global-app-tour.css';
import { ChevronLeft, ChevronRight, FileSignature, Home, Megaphone, Search, Share2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWorkspace } from '@/hooks/useWorkspace';
import { RitaAvatar } from '@/components/RitaAvatar';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import { useBrokersOnly as useTourBrokersOnly } from '@/hooks/usePlatformMode';
import realtyzLogo from '@/assets/realtyz-logo.webp';
import { APP_TOUR_EVENT, buildWalkthrough, useWalkthrough, walkthroughStore } from '@/lib/appWalkthrough';
import { WelcomeSlides } from '@/components/public/WelcomeSlides';
import { shouldShowWelcome } from '@/lib/welcomePreference';
import { openFaq } from '@/components/faq/FaqDialog';

export function GlobalAppTour() {
  const tourBrokersOnly = useTourBrokersOnly();
  const [showWelcome, setShowWelcome] = useState(false);
  const session = useWalkthrough();
  const { user } = useAuth();
  const role = useUserRole();
  const { activeWorkspaceId } = useWorkspace();
  const { setOpenMobile, setOpen } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const activeDriver = useRef<Driver | null>(null);
  const close = () => {
    setShowWelcome(false);
    const current = walkthroughStore.get();
    walkthroughStore.stop();
    setOpenMobile(false); setOpen(false);
    if (current) navigate(current.origin);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const start = () => {
      if (!user || role.loading || role.error) return;
      setShowWelcome(false);
      // Read before the drawer closes; no hidden role's menu can enter the tour.
      const menus = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-walkthrough-path]'))
        .map((anchor) => ({ path: anchor.dataset.walkthroughPath ?? '', title: anchor.dataset.walkthroughTitle ?? anchor.textContent ?? '' }));
      walkthroughStore.start(buildWalkthrough(menus), locationRef.current.pathname + locationRef.current.search, user.id, activeWorkspaceId ?? '');
      window.dispatchEvent(new Event('realtyz:walkthrough-active'));
      setOpenMobile(false); setOpen(false);
    };
    window.addEventListener(APP_TOUR_EVENT, start);
    return () => window.removeEventListener(APP_TOUR_EVENT, start);
  }, [user, role.loading, role.error, activeWorkspaceId, setOpenMobile, setOpen]);

  useEffect(() => {
    if (session && (session.userId !== user?.id || session.workspaceId !== (activeWorkspaceId ?? '') || role.error)) {
      setShowWelcome(false);
      walkthroughStore.stop(); setOpenMobile(false);
    }
  }, [session, user?.id, activeWorkspaceId, role.error, setOpenMobile]);

  useEffect(() => {
    if (!session || session.index === 0 || role.loading) return;
    const step = session.steps[session.index];
    if (!step) return;
    let cancelled = false;
    let footerRoot: Root | null = null;
    let closeRoot: Root | null = null;
    let currentDriver: Driver | null = null;
    let frame = 0;
    const sidebar = step.sidebar === true;
    setOpenMobile(sidebar); setOpen(sidebar);
    if (step.path && location.pathname !== step.path) {
      navigate(step.path);
      return;
    }
    const started = performance.now();
    const highlight = () => {
      if (cancelled) return;
      const target = step.selector ? document.querySelector<HTMLElement>(step.selector) : null;
      const rect = target?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.height > 0;
      // Wait for lazy pages and the drawer transition. Never spotlight unrelated UI.
      if ((step.selector && !visible || performance.now() - started < 320) && performance.now() - started < 5000) {
        frame = requestAnimationFrame(highlight); return;
      }
      if (step.selector && !visible) { walkthroughStore.move(session.index + 1); return; }
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      currentDriver = driver({
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        overlayColor: getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()})` : 'CanvasText',
        overlayOpacity: 0.55, stagePadding: 6, stageRadius: 8,
        disableActiveInteraction: true, allowKeyboardControl: false,
        overlayClickBehavior: 'none', popoverClass: 'realtyz-global-tour',
        showButtons: ['close'], closeBtnLabel: 'סגור סיור',
        onCloseClick: () => closeRef.current(),
        onPopoverRender: (popover) => {
          popover.wrapper.setAttribute('dir', 'rtl');
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-label', step.title);
          popover.wrapper.setAttribute('tabindex', '-1');
          popover.footer.style.display = 'flex';
          footerRoot = createRoot(popover.footerButtons);
          footerRoot.render(<>
            <Button variant="outline" onClick={() => walkthroughStore.move(session.index - 1)} aria-label="הקודם"><ChevronRight />הקודם</Button>
            <bdi dir="ltr" className="text-sm font-semibold text-muted-foreground" aria-live="polite">{session.index + 1} / {session.steps.length}</bdi>
            <Button onClick={() => session.index === session.steps.length - 1 ? closeRef.current() : walkthroughStore.move(session.index + 1)}>
              {session.index === session.steps.length - 1 ? 'סיום' : 'הבא'}<ChevronLeft />
            </Button>
          </>);
          closeRoot = createRoot(popover.closeButton);
          closeRoot.render(<X className="h-7 w-7" strokeWidth={2} aria-hidden="true" />);
          popover.wrapper.focus({ preventScroll: true });
        },
      });
      activeDriver.current = currentDriver;
      currentDriver.highlight({ element: visible && target ? target : undefined, popover: { title: step.title, description: step.body, side: sidebar ? 'left' : 'bottom', align: 'center' } });
    };
    frame = requestAnimationFrame(highlight);
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      footerRoot?.unmount(); closeRoot?.unmount(); currentDriver?.destroy(); activeDriver.current = null;
    };
  }, [session, location.pathname, role.loading, navigate, setOpenMobile, setOpen]);

  useEffect(() => {
    if (!session) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab' && activeDriver.current) {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.realtyz-global-tour button')).filter((button) => !button.disabled);
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement as HTMLButtonElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !buttons.includes(document.activeElement as HTMLButtonElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => window.removeEventListener('keydown', keyboard, true);
  }, [session]);

  if (!session || session.index !== 0) return null;
  if (showWelcome) return <div className="fixed inset-x-0 bottom-0 top-16 z-[60] overflow-hidden overscroll-none bg-background"><WelcomeSlides onDone={() => setShowWelcome(false)} /></div>;
  const points = tourBrokersOnly ? [
    { icon: Home, title: 'הנכסים שלי', body: 'מעלים נכס או מייבאים מיד2 ומנהלים את כל המלאי במקום אחד.' },
    { icon: Users, title: 'לידים ופניות', body: 'כל פנייה נכנסת לטבלה אחת, עם מקור, סטטוס וסיכום שיחה.' },
    { icon: Megaphone, title: 'קמפיינים', body: 'יוצרים פוסטים לנכסים ומפרסמים בקבוצות ובעמוד הפייסבוק.' },
    { icon: FileSignature, title: 'מטלות וחתימות', body: 'סיורים, תזכורות והסכמי תיווך לחתימה דיגיטלית.' },
  ] : [
    { icon: Home, title: 'מפרסמים נכסים', body: 'מתווכים ויזמים מעלים נכסים ופרויקטים ללוח המשותף.' },
    { icon: Search, title: 'מוצאים הזדמנויות', body: 'קונים, שוכרים ומוכרים מחפשים ופונים ישירות.' },
    { icon: Share2, title: 'משתפים ומרוויחים', body: 'שותפים מפיצים נכסים ועוקבים אחרי התגמולים.' },
    { icon: Users, title: 'מנהלים לידים', body: 'כל פנייה מגיעה לטבלה אחת עם סטטוס וסיכום שיחה.' },
  ];
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent dir="rtl" className="flex max-h-[90dvh] max-w-lg flex-col gap-4 p-5 sm:p-6">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {tourBrokersOnly ? <PlatformBrand className="mx-auto h-8" /> : <img src={realtyzLogo} alt="TORAFF" className="mx-auto h-9 w-auto object-contain" />}
        <DialogTitle className="sr-only">מדריך TORAFF</DialogTitle>
        <DialogDescription className="text-center text-base leading-relaxed text-muted-foreground">
          {tourBrokersOnly ? 'כל מה שמתווך צריך כדי לנהל נכסים, לידים ופרסום במקום אחד.' : 'נכסים, אנשים והזדמנויות נפגשים במקום אחד.'}
        </DialogDescription>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {points.map(({ icon: Icon, title, body }) => <li key={title} className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0"><p className="text-sm font-bold">{title}</p><p className="text-sm leading-snug text-muted-foreground">{body}</p></div>
          </li>)}
        </ul>
        <div className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
          <RitaAvatar className="h-11 w-11" />
          <div className="min-w-0">
            <p className="text-sm font-bold">ריטה, סוכנת ה-AI שלכם</p>
            <p className="text-sm leading-snug text-muted-foreground">{tourBrokersOnly ? 'עונה ללידים, מסננת פניות ומעדכנת אתכם מי מוכן לסיור, 24/7.' : 'מושכת פניות, מנהלת תוכן ועובדת בשבילכם 24/7.'}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <Button size="lg" className="w-full text-base font-bold" onClick={() => walkthroughStore.move(1)}>מתחילים את הסיור<ChevronLeft /></Button>
        <div className="flex flex-row gap-2">
          {!tourBrokersOnly && <Button variant="outline" className="min-w-0 flex-1" onClick={() => setShowWelcome(shouldShowWelcome('instructions'))}>היכרות עם TORAFF</Button>}
          <Button variant="outline" className="min-w-0 flex-1" onClick={() => { close(); openFaq(); }}>שאלות ותשובות</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
