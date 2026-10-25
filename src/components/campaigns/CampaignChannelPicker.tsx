import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignServiceIcon } from './CampaignServiceIcon';
import { useCampaignPricing } from '@/hooks/useCampaignPricing';
import { campaignServicePrice, formatCampaignCredits } from '@/lib/campaignServicePricing';

export const DISTRIBUTION_CHANNELS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'whatsapp', label: 'WhatsApp הרשמי' },
  { id: 'sms', label: 'SMS' },
  { id: 'ivr', label: 'IVR' },
  { id: 'email', label: 'אימייל' },
] as const;
export type DistributionChannel = typeof DISTRIBUTION_CHANNELS[number]['id'];

export function CampaignChannelPicker({ selected, onSelect, onBack }: {
  selected: DistributionChannel | null;
  onSelect: (channel: DistributionChannel) => void;
  onBack: () => void;
}) {
  const { data: prices = [], isLoading, isError, refetch } = useCampaignPricing();
  const channel = DISTRIBUTION_CHANNELS.find((item) => item.id === selected);
  const price = channel ? campaignServicePrice(channel.id, prices) : null;
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        {channel && <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="חזרה לבחירת ערוץ"><ArrowRight /></Button>}
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            {channel && <CampaignServiceIcon channel={channel.id} className="h-6 w-6" />}
            {channel ? `הגדרת קמפיין · ${channel.label}` : 'בחירת ערוץ להפצה'}
          </h2>
          {channel && <div className="mt-1 text-sm text-muted-foreground">{price ? `${formatCampaignCredits(price.credits)} ל${price.unit}` : 'המחירון אינו זמין'}</div>}
        </div>
      </div>
      {!channel && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {DISTRIBUTION_CHANNELS.map((item) => {
          const configured = campaignServicePrice(item.id, prices);
          return <Button key={item.id} type="button" variant="outline" onClick={() => onSelect(item.id)} aria-label={`בחירת ${item.label}`}
            className="group relative h-auto min-h-36 flex-col gap-3 whitespace-normal rounded-lg border-border bg-card p-4 text-center hover:border-primary hover:bg-accent focus-visible:ring-primary [&_svg]:size-7">
            <CampaignServiceIcon channel={item.id} className="h-7 w-7" />
            <span className="text-base font-semibold">{item.label}</span>
            <span className="text-xs font-normal text-muted-foreground">{configured ? `${formatCampaignCredits(configured.credits)} ל${configured.unit}` : isLoading ? 'טוען מחיר…' : 'המחירון אינו זמין'}</span>
            <ArrowLeft className="absolute left-2 top-2 !size-4 text-muted-foreground transition-transform motion-safe:group-hover:-translate-x-1" aria-hidden />
          </Button>;
        })}
      </div>}
      {isError && <Button variant="link" onClick={() => void refetch()}>טעינת המחירון מחדש</Button>}
    </section>
  );
}