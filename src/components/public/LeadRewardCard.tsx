import { useState, type ReactNode } from 'react';
import { ChevronDown, Trophy, ClipboardList as LeadFormIcon, Phone as LeadPhoneIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { leadPriceLabel } from '@/lib/leadPriceLabel';
import { leadPriceLevel } from '@/lib/leadPriceRanges';
import { PricingCardHeader } from './PricingCardHeader';
import { CollapsedOffer } from './CollapsedOffer';
import { PublisherWhatsAppIcon } from './PublisherWhatsAppIcon';
import { LeadPriceSlider } from './LeadPriceSlider';

export type LeadRewardTier = 'form' | 'whatsapp' | 'phone';
/** Step 8 ("תגמולים לפי סוג פנייה") lead types, shared by every reward editor. */
export const LEAD_REWARD_TYPES = [
  { tier: 'form', label: 'השארת פרטים בעמוד נחיתה' },
  { tier: 'whatsapp', label: 'פנייה מסוננת בוואטסאפ עם ריטה AI' },
  { tier: 'phone', label: 'פנייה מסוננת טלפונית עם ריטה AI' },
] as const;
export const CLOSING_REWARD_LABEL = 'עמלת תיווך עבור סגירת עסקה';

export function RewardCardsTitle({ children }: { children?: ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><h3 className="text-base font-semibold">תגמולים לפי סוג פנייה</h3>{children}</div>;
}

/** One Step 8 lead-type card: icon, collapsed offer, slider, optional 24h limit and extra content. */
export function LeadRewardCard({ tier, label, value, onChange, limit, onLimitChange, children, defaultOpen = false, disabled = false }: {
  tier: LeadRewardTier; label: string; value: string; onChange: (value: string) => void;
  limit?: string; onLimitChange?: (value: string) => void; children?: ReactNode; defaultOpen?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const price = Number(value) || 0;
  const active = price > 0;
  const toggle = () => setOpen(v => !v);
  const iconClass = cn('!h-[29.3px] !w-[29.3px] shrink-0', active ? 'closing-tone' : 'pricing-icon-disabled');
  const icon = tier === 'form' ? <LeadFormIcon className={iconClass} strokeWidth={1} aria-hidden /> : tier === 'whatsapp' ? <PublisherWhatsAppIcon className={iconClass} strokeWidth={1} /> : <LeadPhoneIcon className={iconClass} strokeWidth={1} aria-hidden />;
  return <Card className="closing-fee space-y-2 rounded-2xl p-4" data-level={leadPriceLevel(tier, price)}>
    <PricingCardHeader icon={icon}
      price={open ? null : <CollapsedOffer active={active} amount={leadPriceLabel(price)} label={`עריכת עמלה עבור ${label}`} onClick={toggle} />}
      title={<Button type="button" variant="ghost" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-start text-base font-bold leading-snug hover:bg-transparent reward-card-title" aria-expanded={open} onClick={toggle}>{label}</Button>}
      help={null}
      controls={<Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 p-0 text-muted-foreground" aria-label={`${open ? 'כווץ' : 'הרחב'} ${label}`} aria-expanded={open} onClick={toggle}><ChevronDown className={cn('h-6 w-6 transition-transform motion-reduce:transition-none', open && 'rotate-180')} /></Button>} />
    {open && <fieldset disabled={disabled} className="space-y-2">
      <LeadPriceSlider dynamicFeedback tier={tier} label={label} value={value} onChange={onChange} />
      {onLimitChange && <div className="flex items-center gap-2"><label className="text-xs font-semibold">הגבלת מספר הפניות בכל 24 שעות:</label><Input inputMode="numeric" maxLength={2} placeholder="ללא הגבלה" aria-label={`מגבלה יומית עבור ${label}`} className="h-9 w-24 px-1 text-center text-[18px] placeholder:text-[14px]" value={limit ?? ''} onChange={e => onLimitChange(e.target.value.replace(/\D/g, ''))} /></div>}
      {children}
    </fieldset>}
  </Card>;
}

/** Closing-fee card wrapper matching Step 8 when an editor needs its own closing control. */
export function ClosingRewardCard({ amount, active, children, level, defaultOpen = false }: { amount: string; active: boolean; children: ReactNode; level?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <Card className="closing-fee space-y-2 rounded-2xl p-4" data-level={level}>
    <PricingCardHeader icon={<Trophy className={cn('!h-[29.3px] !w-[29.3px] shrink-0', active ? 'closing-tone' : 'pricing-icon-disabled')} strokeWidth={1} aria-hidden />}
      price={open ? null : <CollapsedOffer active={active} amount={amount} label={`עריכת ${CLOSING_REWARD_LABEL}`} onClick={() => setOpen(true)} />}
      title={<Button type="button" variant="ghost" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-start text-base font-bold leading-snug hover:bg-transparent reward-card-title" aria-expanded={open} onClick={() => setOpen(v => !v)}>{CLOSING_REWARD_LABEL}</Button>}
      help={null}
      controls={<Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 p-0 text-muted-foreground" aria-label={`${open ? 'כווץ' : 'הרחב'} ${CLOSING_REWARD_LABEL}`} aria-expanded={open} onClick={() => setOpen(v => !v)}><ChevronDown className={cn('h-6 w-6 transition-transform', open && 'rotate-180')} /></Button>} />
    {open && children}
  </Card>;
}
