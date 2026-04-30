import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';

interface AiNarrativeProps {
  narrative?: string;
  isLoading: boolean;
}

export default function AiNarrative({ narrative, isLoading }: AiNarrativeProps) {
  return (
    <Card
      variant="active"
      className="bg-gradient-to-l from-gold/8 via-card/40 to-transparent"
    >
      <CardContent className="flex items-start gap-3 pt-5 pb-4">
        <div className="shrink-0 mt-0.5">
          <div className="h-9 w-9 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-gold" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold/80 mb-1">
            תובנת AI
          </p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">{narrative}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
