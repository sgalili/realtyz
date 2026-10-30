import type { ReactNode } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BoardSearchControls({ query, onQueryChange, onSearch, filter, grid, onViewToggle }: {
  query: string; onQueryChange: (value: string) => void; onSearch?: () => void; filter: ReactNode;
  grid: boolean; onViewToggle: () => void;
}) {
  return <div className="mx-auto flex w-full max-w-6xl flex-nowrap items-center gap-1 sm:gap-2">
    <div className="relative min-w-0 flex-[1_1_12rem]">
      <Input value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onSearch?.(); }} placeholder="חיפוש נכס" className="ps-9" />
      <span className="absolute start-1 top-1/2 flex -translate-y-1/2">{filter}</span>
    </div>
    {query.trim() && onSearch ? <Button type="button" className="shrink-0" onClick={onSearch}>חיפוש</Button> : null}
    <div className="inline-flex shrink-0 items-center rounded-md bg-background py-1 ps-1">
      <Button className="shrink-0" size="icon" variant="ghost" onClick={onViewToggle} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
    </div>
  </div>;
}