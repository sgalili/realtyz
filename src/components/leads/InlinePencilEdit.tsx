import { useState, ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  label?: string;
  tooltip?: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}

/**
 * Compact pencil-icon trigger that opens a popover for inline edits.
 * Replaces verbose "עריכה (הוספה/הסרה)" text links across the CRM grid.
 */
export function InlinePencilEdit({ tooltip = 'עריכה', className, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6 text-muted-foreground hover:text-foreground',
                className,
              )}
              aria-label={tooltip}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-3" align="end">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
