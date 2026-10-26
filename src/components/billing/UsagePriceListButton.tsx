import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ACTION_META, agorotToCredits, fmtCreditsShort } from '@/lib/credits';
import { BrandLogo } from '@/components/social/BrandLogo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type PriceRow = { action_key: string; label_he: string; unit_he: string; price_agorot: number };

/** ניסוח ספציפי לשורות המחירון — עוקף את הטקסט הנשמר ב-action_pricing לתצוגה בלבד. */
const ROW_OVERRIDES: Record<string, { label?: string; unit?: string }> = {
  whatsapp_marketing: { unit: 'לחלון הודעות של 24 שעות' },
  sms: { unit: 'להודעה עד 210 תווים' },
  ai_heavy: { label: 'ניתוח נכס וחילוץ נתונים חכם ב-AI' },
  social_post: { label: 'יצירה ופרסום פוסט Facebook / Instagram', unit: '(עד שלוש גרסאות)' },
};

export function UsagePriceListButton() {
  const [open, setOpen] = useState(false);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['action-pricing'],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('action_pricing')
        .select('action_key,label_he,unit_he,price_agorot').order('sort_order');
      if (error) throw error;
      return (data ?? []) as PriceRow[];
    },
  });

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="מחירון שימוש בקרדיטים" title="מחירון שימוש בקרדיטים"
        className="h-9 w-9 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M4 20V4h6a4 4 0 0 1 4 4v8M10 8v12h6a4 4 0 0 0 4-4V4" /></svg>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>מחירון שימוש בקרדיטים</DialogTitle></DialogHeader>
          {isLoading ? <div className="flex justify-center p-6" role="status" aria-label="טוען מחירון"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            : isError ? <div className="space-y-3"><p className="text-sm text-destructive">לא ניתן לטעון את המחירון</p><Button variant="outline" onClick={() => void refetch()}>ניסיון נוסף</Button></div>
            : data.length === 0 ? <p className="text-sm text-muted-foreground">המחירון אינו זמין כרגע</p>
            : <dl className="divide-y divide-border">{data.map((row) => {
              const meta = ACTION_META[row.action_key];
              const Icon = meta?.icon;
              const override = ROW_OVERRIDES[row.action_key];
              const label = override?.label ?? row.label_he;
              const unit = override?.unit ?? `ל${row.unit_he}`;
              return (
                <div key={row.action_key} className="flex items-center gap-3 py-3">
                  {Icon && (
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tone}`} aria-hidden="true">
                      {row.action_key === 'social_post'
                        ? <BrandLogo platform="facebook" className="h-4 w-4" />
                        : <Icon className="h-4 w-4" />}
                    </span>
                  )}
                  <dt className="min-w-0 flex-1 text-base font-medium">
                    {label}
                    <span className="block text-sm font-normal text-muted-foreground">{unit}</span>
                  </dt>
                  <dd className="shrink-0 text-base font-bold tabular-nums">{fmtCreditsShort(agorotToCredits(Number(row.price_agorot)))}</dd>
                </div>
              );
            })}</dl>}
        </DialogContent>
      </Dialog>
    </>
  );
}
