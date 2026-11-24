import { Button } from '@/components/ui/button';
import { Eye, RotateCcw } from 'lucide-react';

export function OtpFailureActions({ onRetry, disabled = false, retryLabel = 'ניסיון נוסף' }: { onRetry: () => void; disabled?: boolean; retryLabel?: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2" dir="rtl">
    <Button type="button" variant="outline" disabled={disabled} onClick={onRetry}><RotateCcw className="h-4 w-4" />{retryLabel}</Button>
    <Button type="button" variant="ghost" asChild><a href="/demo/broker/properties"><Eye className="h-4 w-4" />מרחב הדגמה</a></Button>
  </div>;
}