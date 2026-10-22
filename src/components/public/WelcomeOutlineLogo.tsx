import { CalendarDays, Facebook, Instagram, Mail, MessageCircle, Youtube } from 'lucide-react';

export function WelcomeOutlineLogo({ platform }: { platform: string }) {
  const Icon = ({ calendar: CalendarDays, facebook: Facebook, instagram: Instagram, gmail: Mail, whatsapp: MessageCircle, youtube: Youtube })[platform] ?? MessageCircle;
  return <Icon className="h-full w-full" strokeWidth={4.5} absoluteStrokeWidth />;
}