import { Rocket } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

export function LaunchPromoBanner() {
  const { status } = useSubscription();
  if (!status) return null;
  const remaining = status.promo_remaining;

  if (status.is_launch_promo) {
    return (
      <div dir="rtl" className="flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
        <Rocket className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          <span className="font-bold">מבצע ההשקה שלך פעיל:</span> 50% הנחה קבועה על החבילה, ו‑15 ₪ מתנה נטענו לארנק.
        </p>
      </div>
    );
  }

  if (remaining <= 0) return null;

  return (
    <div dir="rtl" className="flex items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
      <Rocket className="h-5 w-5 shrink-0 text-primary" />
      <p className="text-sm text-foreground">
        <span className="font-bold">מבצע השקה — נותרו {remaining} מקומות מתוך {status.promo_slots}:</span>{' '}
        50% הנחה על החבילה החודשית לכל אורך המנוי, ועוד 15 ₪ מתנה לארנק הקרדיטים.
      </p>
    </div>
  );
}

export default LaunchPromoBanner;
