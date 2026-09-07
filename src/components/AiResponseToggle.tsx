import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAutoFlags } from '@/hooks/useAutoFlags';
import { cn } from '@/lib/utils';

/**
 * Collapsed robot button for the page hero.
 * Shows a green/white active state when either AI auto-reply is ON,
 * and a grayscale muted state when both are OFF.
 * Clicking opens the two sentiment switches stacked vertically.
 */
export function AiResponseToggle() {
  const { autoFlags, setAutoFlag } = useAutoFlags();
  const [open, setOpen] = useState(false);
  const aiPositiveOn = autoFlags.auto_reply_positive === true;
  const aiNegativeOn = autoFlags.auto_reply_negative === true;
  const active = aiPositiveOn || aiNegativeOn;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="מענה AI"
          aria-label="מענה AI"
          className={cn(
            'h-9 w-9 rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-white/40',
            active
              ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white'
              : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground opacity-60 grayscale hover:bg-muted/60 hover:text-muted-foreground'
          )}
        >
          <Bot className="h-5 w-5" strokeWidth={2} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-64 p-3 text-right"
        dir="rtl"
      >
        <p className="mb-2 text-sm font-semibold text-foreground">מענה AI</p>
        <div className="space-y-2">
          <label
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors cursor-pointer',
              aiPositiveOn
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-amber-300 bg-amber-50'
            )}
          >
            <span className="text-sm font-semibold text-slate-800 leading-tight min-w-0">
              {aiPositiveOn ? 'חיוביות: AI' : 'חיוביות: נציג'}
            </span>
            <Switch
              checked={aiPositiveOn}
              onCheckedChange={(v) => setAutoFlag('auto_reply_positive', v)}
            />
          </label>
          <label
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors cursor-pointer',
              aiNegativeOn
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-amber-300 bg-amber-50'
            )}
          >
            <span className="text-sm font-semibold text-slate-800 leading-tight min-w-0">
              {aiNegativeOn ? 'שליליות: AI' : 'שליליות: נציג'}
            </span>
            <Switch
              checked={aiNegativeOn}
              onCheckedChange={(v) => setAutoFlag('auto_reply_negative', v)}
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AiResponseToggle;
