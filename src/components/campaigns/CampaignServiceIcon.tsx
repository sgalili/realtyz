import { AudioLines, PhoneCall } from 'lucide-react';
import { BrandLogo } from '@/components/social/BrandLogo';
import { cn } from '@/lib/utils';

export function CampaignServiceIcon({ channel, className = 'h-4 w-4' }: { channel: string; className?: string }) {
  if (channel === 'ivr') return <PhoneCall className={cn('shrink-0 text-social-signal', className)} />;
  if (channel === 'voice' || channel === 'ai-call') return <AudioLines className={cn('shrink-0 text-warning', className)} />;
  return <BrandLogo platform={channel} className={className} />;
}