import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LISTING_SORT_OPTIONS, type ListingSortValue } from '@/lib/listingSortOptions';

/**
 * The sorting menu used by every listing view: the same icon button, the same
 * "מיון תוצאות" heading and the same options everywhere.
 */
export function SortDropdown({
  value,
  onChange,
  options = LISTING_SORT_OPTIONS,
}: {
  value: ListingSortValue;
  onChange: (value: ListingSortValue) => void;
  options?: readonly { value: ListingSortValue; label: string }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 border-0 bg-transparent text-xs shadow-none hover:bg-transparent hover:text-inherit"
          aria-label="מיון"
          title="מיון"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">מיון תוצאות</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as ListingSortValue)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
