import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Accessibility, Menu, LogIn, CircleHelp, Info, Scale, ChevronDown, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AccessibilityMenu } from '@/components/accessibility/AccessibilityMenu';
import { VisitorRitaChat } from './VisitorRitaChat';
import { openFaq } from '@/components/faq/FaqDialog';
import { officialWaLink } from '@/lib/officialWa';
import { VISITOR_WHATSAPP_INTRO } from '@/lib/visitorWhatsApp';

export function VisitorMenu({ onSignup }: { onSignup: () => void }) {
  const [open, setOpen] = useState(false);
  const [legal, setLegal] = useState(false);
  const navigate = useNavigate();
  const signup = () => { setOpen(false); onSignup(); };
  const go = (path: string) => { setOpen(false); navigate(path); };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" className="board-header-icon-btn h-[46.8px] w-[46.8px]" aria-label="תפריט מבקרים"><Menu className="!h-[26px] !w-[26px]" strokeWidth={2} aria-hidden="true" /></Button></SheetTrigger>
    <SheetContent side="right" dir="rtl" className="right-3 flex w-[calc(100%-40px)] max-w-sm flex-col gap-0 overflow-visible p-0 pt-12">
      <SheetTitle className="sr-only">תפריט מבקרים</SheetTitle><SheetDescription className="sr-only">TORAFF</SheetDescription>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="ניווט מבקרים">
        <Button className="mb-3 min-h-12 w-full gap-2 text-base" onClick={signup}><LogIn className="h-5 w-5" />הרשמה חינם או כניסה</Button>
        <Button asChild className="mb-3 min-h-12 w-full gap-2 bg-success text-success-foreground hover:bg-success/90 text-lg"><a href={officialWaLink(VISITOR_WHATSAPP_INTRO)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><MessageCircle className="h-5 w-5" />דברו איתנו</a></Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-lg" onClick={() => { setOpen(false); openFaq(); }}><CircleHelp className="h-5 w-5" />שאלות ותשובות</Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-lg" onClick={() => go('/about-toraff')}><Info className="h-5 w-5" />מה זה TORAFF</Button>
        <Button variant="ghost" className="min-h-12 w-full justify-start gap-3 text-lg" aria-expanded={legal} onClick={() => setLegal(v => !v)}><Scale className="h-5 w-5" />מידע משפטי<ChevronDown className="ms-auto h-4 w-4" /></Button>
        {legal && <div className="border-s border-border ps-5">{[['תנאי שימוש','/terms'],['מדיניות פרטיות','/privacy-policy'],['עמלות ותגמולים','/commission-mechanism'],['כללי תיווך','/terms#brokerage-commissions']].map(([label,path]) => <Button key={path} variant="ghost" className="min-h-11 w-full justify-start text-base" onClick={() => go(path)}>{label}</Button>)}</div>}
      </nav>
      {open && <div className="relative shrink-0 pt-12"><AccessibilityMenu trigger={<Button variant="outline" size="icon" className="absolute -right-3 top-0 h-11 w-11 rounded-full border-primary bg-background text-primary shadow-sm" aria-label="פתיחת תפריט נגישות"><Accessibility className="h-6 w-6" /></Button>} /><VisitorRitaChat onSignup={signup} /></div>}
    </SheetContent>
  </Sheet>;
}