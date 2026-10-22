import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './global-app-tour.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWorkspace } from '@/hooks/useWorkspace';
import { RitaAvatar } from '@/components/RitaAvatar';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { APP_TOUR_EVENT, buildWalkthrough, useWalkthrough, walkthroughStore } from '@/lib/appWalkthrough';
import { WelcomeSlides } from '@/components/public/WelcomeSlides';
import { shouldShowWelcome } from '@/lib/welcomePreference';

export function GlobalAppTour() {
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
          popover.wrapper.focus({ preventScroll: true });
        },
      });
      activeDriver.current = currentDriver;
      currentDriver.highlight({ element: visible && target ? target : undefined, popover: { title: step.title, description: step.body, side: sidebar ? 'left' : 'bottom', align: 'center' } });
    };
    frame = requestAnimationFrame(highlight);
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      footerRoot?.unmount(); currentDriver?.destroy(); activeDriver.current = null;
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
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] max-w-xl overflow-y-auto p-6 sm:p-8">
      <img src={realtyzLogo} alt="TORAFF" className="mx-auto h-14 w-auto object-contain" />
      <DialogTitle className="text-center text-3xl font-extrabold">ברוכים הבאים לרילטיז</DialogTitle>
      <DialogDescription className="text-center text-xl leading-relaxed text-foreground">
        נכסים, אנשים והזדמנויות נפגשים במקום אחד.
      </DialogDescription>
      <p className="text-lg leading-relaxed">מתווכים מורשים מקדמים עסקאות; יזמים מציגים פרויקטים; קונים ומוכרים פרטיים מוצאים הזדמנויות; ושותפים משתפים נכסים ועוקבים אחרי תגמולים. לכל תפקיד הדרך שלו להתקדם ולהרוויח.</p>
      <div className="flex items-start gap-4 border-y border-border py-4">
        <RitaAvatar className="h-16 w-16" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-2xl font-extrabold">הכירו את ריטה</h2>
          <p className="text-lg leading-relaxed"><strong>סוכנת ה-AI שלכם</strong> מושכת פניות, מנהלת תוכן ועוזרת להפוך הזדמנויות להכנסה. האוטומציות שהפעלתם עובדות על טייס אוטומטי <strong>24/7, גם בזמן שאתם ישנים.</strong></p>
        </div>
      </div>
      <Button variant="outline" size="lg" className="w-full text-lg" onClick={() => setShowWelcome(shouldShowWelcome('instructions'))}>היכרות עם TORAFF<ChevronLeft /></Button>
      <Button size="lg" className="w-full text-lg font-bold" onClick={() => walkthroughStore.move(1)}>מתחילים את הסיור<ChevronLeft /></Button>
    </DialogContent>
  </Dialog>;
}