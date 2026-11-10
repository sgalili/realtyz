import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FEATURE_GROUPS } from '@/lib/propertyFeatureCatalog';

type Props = {
  selected: string[];
  onToggle: (label: string, on: boolean) => void;
};

/** Compact grouped dropdown menus holding the full Yad2 feature catalog. */
export function PropertyFeatureMenus({ selected, onToggle }: Props) {
  const chosen = new Set(selected);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" dir="rtl">
      {FEATURE_GROUPS.map((group) => {
        const picked = group.options.filter((o) => chosen.has(o.label)).map((o) => o.label);
        return (
          <Popover key={group.id}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-auto min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-start"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-muted-foreground">{group.title}</span>
                  <span className={`block truncate text-base ${picked.length ? 'font-medium text-foreground' : 'text-muted-foreground/60'}`}>
                    {picked.length ? picked.join(', ') : 'בחירה'}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1" dir="rtl">
              {group.options.map((o) => {
                const on = chosen.has(o.label);
                return (
                  <button
                    key={o.label}
                    type="button"
                    role={group.single ? 'menuitemradio' : 'menuitemcheckbox'}
                    aria-checked={on}
                    onClick={() => onToggle(o.label, !on)}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-base hover:bg-accent"
                  >
                    <span>{o.label}</span>
                    {on && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

export default PropertyFeatureMenus;
