import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame, TrendingUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

type Components = {
  frequency?: number;
  sentiment?: number;
  response_speed?: number;
  property_interest?: number;
};

interface PriorityScoreBadgeProps {
  score: number;
  components?: Components | null;
  previousScore?: number;
  className?: string;
}

function tierFor(score: number): {
  label: string;
  icon: typeof Flame;
  className: string;
} {
  if (score >= 80) {
    return {
      label: 'Hot',
      icon: Flame,
      className: 'bg-destructive/10 text-destructive border-destructive/30',
    };
  }
  if (score >= 60) {
    return {
      label: 'Warm',
      icon: TrendingUp,
      className: 'bg-warning/10 text-warning border-warning/30',
    };
  }
  if (score >= 30) {
    return {
      label: 'Active',
      icon: Sparkles,
      className: 'bg-primary/10 text-primary border-primary/30',
    };
  }
  return {
    label: 'Cold',
    icon: Sparkles,
    className: 'bg-muted text-muted-foreground border-border',
  };
}

/**
 * Predictive Prospect Score badge — shows a 0-100 score with a tier label.
 * Hover reveals the per-signal breakdown (frequency, sentiment, response speed,
 * property interest) so the agent can understand WHY this prospect is priority.
 */
export function PriorityScoreBadge({
  score,
  components,
  previousScore,
  className,
}: PriorityScoreBadgeProps) {
  const tier = tierFor(score);
  const Icon = tier.icon;
  const delta = previousScore != null ? score - previousScore : 0;
  const showSpike = delta >= 15 && score >= 60;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              tier.className,
              className,
            )}
          >
            <Icon className="h-3 w-3" />
            <span>{score}</span>
            <span className="opacity-70 font-normal">{tier.label}</span>
            {showSpike && <span className="ml-0.5">↑</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-semibold mb-1">Priority Score · {score}/100</div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>Frequency: <span className="text-foreground">{components?.frequency ?? 0}/30</span></div>
            <div>Sentiment: <span className="text-foreground">{components?.sentiment ?? 0}/25</span></div>
            <div>Response speed: <span className="text-foreground">{components?.response_speed ?? 0}/25</span></div>
            <div>Property interest: <span className="text-foreground">{components?.property_interest ?? 0}/20</span></div>
          </div>
          {showSpike && (
            <div className="mt-1 text-destructive font-medium">🔥 Hot lead — score spiked +{delta}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
