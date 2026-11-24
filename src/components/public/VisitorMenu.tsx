import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { Accessibility, ChevronDown, CircleHelp, Eye, Info, LogIn, Menu, MessageCircle, Scale, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AccessibilityMenu } from '@/components/accessibility/AccessibilityMenu';
import { VisitorRitaChat } from './VisitorRitaChat';
import { officialWaLink } from '@/lib/officialWa';
import { VISITOR_WHATSAPP_INTRO } from '@/lib/visitorWhatsApp';

/** Used only when the header row cannot be measured (unexpected layout). */
const FALLBACK_HEADER_HEIGHT = 64;

export function VisitorMenu({ onSignup }: { onSignup: () => void }) {
  const [open, setOpen] = useState(false);
  const [legal, setLegal] = useState(false);
  const brokersOnly = useBrokersOnly();
  const navigate = useNavigate();
  const signup = () => { setOpen(false); onSignup(); };
  const login = () => { setOpen(false); navigate('/auth', { state: { signup: false } }); };
  const go = (path: string) => { setOpen(false); navigate(path); };
  const anchorRef = useRef<HTMLDivElement>(null);
  // The panel opens right below the site header so the header stays fully visible,
  // and follows the visual viewport so the mobile keyboard lifts Rita's box instead of covering it.
  const [box, setBox] = useState<{ top: number; height: number; close: { top: number; left: number } } | null>(null);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const row = anchorRef.current?.closest('div.grid') ?? document.querySelector('[aria-label="TORAFF - דף הבית"]');
      const headerBottom = Math.max(0, Math.round(row?.getBoundingClientRect().bottom ?? FALLBACK_HEADER_HEIGHT));
      const viewport = window.visualViewport;
      const keyboard = viewport && window.innerHeight - viewport.height > 80
        ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
        : { top: 0, bottom: window.innerHeight };
      const top = Math.max(headerBottom, keyboard.top);
      const trigger = anchorRef.current?.querySelector('button')?.getBoundingClientRect();
      const close = trigger
        ? {
            top: Math.max(4, trigger.top - 8),
            left: Math.max(4, Math.min(window.innerWidth - 32, trigger.right - 20)),
          }
        : { top: 4, left: 4 };
      setBox({ top, height: Math.max(0, keyboard.bottom - top), close });
    };
    measure();
    const viewport = window.visualViewport;
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, [open]);
  return <Sheet open={open} onOpenChange={setOpen}>
    <div ref={anchorRef} className="contents"><SheetTrigger asChild><Button variant="ghost" size="icon" className="board-header-icon-btn h-[46.8px] w-[46.8px]" aria-label="תפריט מבקרים"><Menu className="!h-[26px] !w-[26px]" strokeWidth={2} aria-hidden="true" /></Button></SheetTrigger></div>
    <SheetContent
      side="right"
      dir="rtl"
      style={box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined}
      overlayStyle={box ? { top: box.top } : undefined}
      closeStyle={box ? { position: 'fixed', top: box.close.top, left: box.close.left, right: 'auto' } : undefined}
      closeClassName="z-[60] flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground opacity-100 shadow-xs hover:bg-muted"
      closeAriaLabel="סגירת התפריט"
      className="right-0 flex w-[calc(100%-28px)] max-w-sm flex-col gap-0 overflow-visible p-0"
    >
      <SheetTitle className="sr-only">תפריט מבקרים</SheetTitle><SheetDescription className="sr-only">TORAFF</SheetDescription>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-10" aria-label="ניווט מבקרים">
        <div data-visitor-auth-actions className="mb-3 grid grid-cols-2 gap-2">
          <Button className="min-h-12 gap-2 text-base" onClick={signup}><UserPlus className="h-5 w-5" aria-hidden="true" />הרשמה חינם</Button>
          <Button variant="outline" className="min-h-12 gap-2 border-primary text-base text-primary hover:bg-primary/10" onClick={login}><LogIn className="h-5 w-5" aria-hidden="true" />כניסה</Button>
        </div>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base" onClick={() => go('/demo')}><Eye className="!h-[26px] !w-[26px] text-primary" />מרחב הדגמה</Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base" onClick={() => go('/faq')}><CircleHelp className="!h-[26px] !w-[26px]" />שאלות ותשובות</Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base" onClick={() => go('/about-toraff')}><Info className="!h-[26px] !w-[26px]" />מה זה TORAFF</Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base" aria-expanded={legal} onClick={() => setLegal(v => !v)}><Scale className="!h-[26px] !w-[26px]" />מידע משפטי<ChevronDown className="ms-auto h-4 w-4" /></Button>
        {legal && <div className="border-s border-border ps-5">{[['תנאי שימוש','/terms'],['מדיניות פרטיות','/privacy-policy'],[brokersOnly ? 'תמחור וקרדיטים' : 'עמלות ותגמולים','/commission-mechanism']].map(([label,path]) => <Button key={path} variant="ghost" className="min-h-11 w-full justify-start text-sm" onClick={() => go(path)}>{label}</Button>)}</div>}
        <Button asChild variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base"><a href={officialWaLink(VISITOR_WHATSAPP_INTRO)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MessageCircle className="!h-[26px] !w-[26px]" />צרו קשר</a></Button>
        <AccessibilityMenu trigger={<Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-base"><Accessibility className="!h-[26px] !w-[26px]" aria-hidden="true" />נגישות</Button>} />
      </nav>
      {open && <div className="shrink-0"><VisitorRitaChat /></div>}
    </SheetContent>
  </Sheet>;
}
