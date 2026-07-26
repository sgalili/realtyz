// Reusable share control for property results — cards, table rows, preview
// dialog and batch selection all mint the same secure landing-page link.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Share2, MessageCircle, Copy, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { UnifiedResult } from '@/lib/propertySearch';
import { shareProperties, type ShareMode } from '@/lib/propertyShare';

export function PropertyShareMenu({
  results,
  iconOnly = false,
  size = 'sm',
  variant = 'outline',
  label = 'שתף',
  className,
  disabled,
}: {
  results: UnifiedResult[];
  iconOnly?: boolean;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const count = results.length;

  const run = async (mode: ShareMode) => {
    setBusy(true);
    try {
      await shareProperties(results, mode);
      if (mode === 'copy') toast.success(count > 1 ? 'הפרטים הועתקו' : 'הקישור הועתק');
    } catch (e: any) {
      toast.error(e?.message ?? 'יצירת קישור השיתוף נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={iconOnly ? 'icon' : size}
          variant={variant}
          disabled={disabled || busy || count === 0}
          onClick={(e) => e.stopPropagation()}
          aria-label={iconOnly ? 'שתף נכס' : undefined}
          title="שתף נכס עם מתעניין"
          className={`gap-1.5 ${iconOnly ? 'h-8 w-8' : ''} ${className ?? ''}`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {!iconOnly && <span>{count > 1 ? `${label} (${count})` : label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">
          {count > 1 ? `שיתוף ${count} נכסים` : 'שיתוף נכס'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run('whatsapp')} className="gap-2 text-sm">
          <MessageCircle className="h-4 w-4" /> וואטסאפ
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('sms')} className="gap-2 text-sm">
          <Smartphone className="h-4 w-4" /> SMS
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('copy')} className="gap-2 text-sm">
          <Copy className="h-4 w-4" /> העתק קישור
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
