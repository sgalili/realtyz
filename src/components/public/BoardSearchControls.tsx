import type { ReactNode } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function BoardSearchControls({ query, onQueryChange, onSearch, filter, deals, onDealToggle, grid, onViewToggle }: {
  query: string; onQueryChange: (value: string) => void; onSearch?: () => void; filter: ReactNode;
  deals: { sale: boolean; rent: boolean }; onDealToggle: (deal: 'sale' | 'rent') => void; grid: boolean; onViewToggle: () => void;
}) {
  return <div className="mx-auto flex w-full max-w-6xl flex-nowrap items-center gap-1 sm:gap-2">
    <div className="relative min-w-0 flex-[1_1_12rem] sm:max-w-md">
      <Input value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onSearch?.(); }} placeholder="חיפוש חופשי" className="ps-9" />
      <span className="absolute start-1 top-1/2 flex -translate-y-1/2">{filter}</span>
    </div>
    {query.trim() && onSearch ? <Button type="button" className="shrink-0" onClick={onSearch}>חיפוש</Button> : null}
    <div className="inline-flex shrink-0 items-center rounded-md bg-background py-1 ps-1">
      {([['sale', 'למכירה'], ['rent', 'להשכרה']] as const).map(([value, label]) => <Button key={value} size="sm" variant="ghost" aria-pressed={deals[value]} onClick={() => onDealToggle(value)} className={cn('gap-1.5 px-2 hover:bg-transparent hover:text-inherit focus-visible:bg-transparent', deals[value] ? 'font-semibold text-foreground hover:!text-foreground' : 'text-muted-foreground/60 hover:!text-muted-foreground/60')}><span className={cn('h-2 w-2 rounded-full', deals[value] ? value === 'sale' ? 'bg-success' : 'bg-sale' : 'bg-muted-foreground/30')} />{label}</Button>)}
      <Button className="shrink-0" size="icon" variant="ghost" onClick={onViewToggle} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
    </div>
  </div>;
}