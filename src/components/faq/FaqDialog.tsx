import { useEffect, useState } from 'react';
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
          <AccordionTrigger className="text-right text-[17px] font-semibold leading-snug focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
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

/** Mounted once in the app layout; opens the FAQ dialog from anywhere via openFaq(). */
export function FaqHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(FAQ_OPEN_EVENT, handler);
    return () => window.removeEventListener(FAQ_OPEN_EVENT, handler);
  }, []);
  return <FaqDialog open={open} onOpenChange={setOpen} />;
}
