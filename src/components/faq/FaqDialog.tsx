import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from '@/lib/router-compat';
import { CircleHelp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { FAQ_ROLE_LABELS, GENERAL_FAQS, ROLE_FAQS, faqRoleFor, type FaqItem } from '@/components/faq/faqData';

/** Global event any entry point (intro slides, help menu, footer) dispatches to open the FAQ. */
export const FAQ_OPEN_EVENT = 'toraf-open-faq';

export function openFaq() {
  window.dispatchEvent(new Event(FAQ_OPEN_EVENT));
}

function FaqAccordion({ items, prefix }: { items: FaqItem[]; prefix: string }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item, i) => (
        <AccordionItem key={`${prefix}-${i}`} value={`${prefix}-${i}`}>
          <AccordionTrigger className="text-right text-[17px] font-semibold leading-snug focus-visible:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-[16px] leading-relaxed text-foreground/80">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function useRoleFaqs() {
  const { user } = useAuth();
  const { roles, loading } = useUserRole();
  const roleKey = user && !loading ? faqRoleFor(roles) : null;
  return { roleKey, roleFaqs: roleKey ? ROLE_FAQS[roleKey] : null };
}

/** Standalone FAQ content for the /faq page. */
export function FaqContent() {
  const { roleKey, roleFaqs } = useRoleFaqs();
  const [params, setParams] = useSearchParams();
  const [heroTabsHost, setHeroTabsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeroTabsHost(document.getElementById('faq-hero-tabs'));
  }, []);
  const tab = roleFaqs && params.get('tab') === 'role' ? 'role' : 'general';
  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    setParams(next, { replace: true });
  };

  return <div dir="rtl">
    {roleFaqs ? <Tabs value={tab} onValueChange={setTab} dir="rtl">
      {heroTabsHost && createPortal(
        <TabsList className="grid h-12 w-full grid-cols-2 rounded-lg bg-primary-foreground/15 text-primary-foreground">
          <TabsTrigger value="general" className="text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-0 data-[state=active]:bg-primary-foreground data-[state=active]:text-primary">שאלות כלליות</TabsTrigger>
          <TabsTrigger value="role" className="text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-0 data-[state=active]:bg-primary-foreground data-[state=active]:text-primary">{FAQ_ROLE_LABELS[roleKey!]}</TabsTrigger>
        </TabsList>,
        heroTabsHost,
      )}
      <TabsContent value="general"><FaqAccordion items={GENERAL_FAQS} prefix="g" /></TabsContent>
      <TabsContent value="role"><FaqAccordion items={roleFaqs} prefix="r" /></TabsContent>
    </Tabs> : <FaqAccordion items={GENERAL_FAQS} prefix="g" />}
  </div>;
}

export function FaqDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { roles, loading } = useUserRole();
  const roleKey = user && !loading ? faqRoleFor(roles) : null;
  const roleFaqs = roleKey ? ROLE_FAQS[roleKey] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="flex max-h-[90dvh] max-w-2xl flex-col gap-3 p-5 sm:p-7 [&>button]:focus-visible:ring-0"
        aria-label="שאלות ותשובות"
      >
        <div className="flex items-center gap-2">
          <CircleHelp className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <DialogTitle className="text-2xl font-extrabold">שאלות ותשובות</DialogTitle>
        </div>
        <DialogDescription className="text-[16px] leading-relaxed">
          כל מה שרציתם לדעת על TORAFF{roleFaqs ? ' — כולל שאלות שמותאמות במיוחד אליכם' : ''}.
        </DialogDescription>

        {roleFaqs ? (
          <Tabs defaultValue="general" dir="rtl" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="grid w-full shrink-0 grid-cols-2">
              <TabsTrigger value="general" className="text-[15px] focus-visible:ring-0">שאלות כלליות</TabsTrigger>
              <TabsTrigger value="role" className="text-[15px] focus-visible:ring-0">{FAQ_ROLE_LABELS[roleKey!]}</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
              <FaqAccordion items={GENERAL_FAQS} prefix="g" />
            </TabsContent>
            <TabsContent value="role" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
              <FaqAccordion items={roleFaqs} prefix="r" />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
            <FaqAccordion items={GENERAL_FAQS} prefix="g" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted once in the app layout; openFaq() anywhere navigates to the standalone /faq page. */
export function FaqHost() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => navigate('/faq');
    window.addEventListener(FAQ_OPEN_EVENT, handler);
    return () => window.removeEventListener(FAQ_OPEN_EVENT, handler);
  }, [navigate]);
  return null;
}
