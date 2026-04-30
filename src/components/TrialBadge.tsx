import { Link } from 'react-router-dom';
import { Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { cn } from '@/lib/utils';

/**
 * Elegant trial indicator for the header. Shows remaining trial days and an
 * "Upgrade Now" call to action. Hidden for non-trial users.
 */
export function TrialBadge() {
  const { isTrial, isTrialExpired, daysRemaining, loading } = useTrialStatus();

  if (loading || !isTrial) return null;

  const expired = isTrialExpired;

  return (
    <div className="hidden md:flex items-center gap-2 ms-2">
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm transition-colors',
          expired
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground',
        )}
        aria-live="polite"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span dir="rtl">
          {expired ? 'תקופת הניסיון הסתיימה' : `ימי ניסיון נותרו: ${daysRemaining}`}
        </span>
      </div>
      <Button
        asChild
        size="sm"
        className="h-7 rounded-full bg-primary-foreground px-3 text-xs font-semibold text-primary hover:bg-primary-foreground/90"
      >
        <Link to="/upgrade" aria-label="שדרג עכשיו">
          <Sparkles className="me-1 h-3.5 w-3.5" />
          שדרג עכשיו
        </Link>
      </Button>
    </div>
  );
}
