import { RotateCcw } from 'lucide-react';
import { Button } from './button';

export function ClearFilterButton({ active, onClear }: { active: boolean; onClear: () => void }) {
  return active ? <div className="flex justify-end" dir="rtl"><Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={onClear}><RotateCcw className="h-3.5 w-3.5" />נקה סינון</Button></div> : null;
}