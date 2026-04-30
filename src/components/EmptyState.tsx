import { Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title?: string;
  message?: string;
  onClear?: () => void;
}

export function EmptyState({ title = 'לא נמצאו תוצאות', message = 'נסה לשנות את הפילטרים או חיפוש אחר', onClear }: Props) {
  return (
    <div className="empty-state animate-fade-in">
      <div className="relative mb-4">
        <div className="h-20 w-20 rounded-full bg-muted/40 flex items-center justify-center">
          <Search className="h-8 w-8 text-muted-foreground/30" />
        </div>
        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-muted/60 flex items-center justify-center">
          <XCircle className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">{message}</p>
      {onClear && (
        <Button variant="outline" size="sm" onClick={onClear} className="gap-2">
          <XCircle className="h-4 w-4" />
          נקה פילטרים
        </Button>
      )}
    </div>
  );
}
