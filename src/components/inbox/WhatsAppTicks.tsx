import { Clock, CircleAlert } from 'lucide-react';
import type { DeliveryStatus } from '@/lib/chatReceipts';

export function WhatsAppTicks({ status = 'sent' }: { status?: DeliveryStatus }) {
  const label = { sent: 'נשלחה', delivered: 'נמסרה', read: 'נקראה', failed: 'השליחה נכשלה', pending: 'ממתינה לשליחה' }[status];
  if (status === 'pending' || status === 'failed') return <span title={label} aria-label={label}>{status === 'pending' ? <Clock className="h-3.5 w-3.5 text-[hsl(var(--chat-tick-muted))]" /> : <CircleAlert className="h-3.5 w-3.5 text-destructive" />}</span>;
  return <svg viewBox="0 0 16 15" width="16" height="15" role="img" aria-label={label} className={`shrink-0 ${status === 'read' ? 'text-[hsl(var(--chat-tick-read))]' : 'text-[hsl(var(--chat-tick-muted))]'}`}><title>{label}</title>
    {status !== 'sent' && <path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.064-.51z" />}
    <path fill="currentColor" d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
  </svg>;
}