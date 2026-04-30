import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildLiveEvent, type FeedEvent } from '@/components/dashboard/LiveActivityFeed';

const makeEvents = (start: number, count: number): FeedEvent[] =>
  Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: index,
      ...buildLiveEvent(index),
      time: index < 6 ? 'עכשיו' : `לפני ${Math.min(59, index * 3)} דק׳`,
    };
  });

export default function LiveActivity() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<FeedEvent[]>(() => makeEvents(0, 28));
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setEvents((current) => [...current, ...makeEvents(current.length, 18)]);
    }, { rootMargin: '280px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="relative flex min-h-12 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 h-10 w-10 shrink-0 border-0 bg-transparent p-0 text-primary-foreground shadow-none hover:bg-transparent hover:text-primary-foreground"
          aria-label="חזרה ללוח הבקרה"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">פעילות חיה</h1>
          <p className="text-sm text-muted-foreground">כל האירועים, השיחות והקמפיינים בזמן אמת</p>
        </div>
      </div>

      <Card className="border-border/70 bg-background shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-2">
            {events.map((evt) => {
              const Icon = evt.icon;
              return (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => navigate(evt.path)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-3 text-right text-sm transition-colors hover:border-primary/20 hover:bg-primary/5"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${evt.color}`} />
                  <span className="min-w-0 flex-1 truncate text-foreground">{evt.text}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{evt.time}</span>
                </button>
              );
            })}
          </div>
          <div ref={sentinelRef} className="h-10" />
        </CardContent>
      </Card>
    </div>
  );
}