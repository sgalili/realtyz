import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditBalancePill } from '@/components/CreditBalancePill';


const SEAT_PRICE = 350;
const SEAT_WALLET_CREDIT = 200;
const SALES_PHONE = '972546811841';

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL')}`;
}

export default function PlanTab() {
  const [seats, setSeats] = useState(1);
  const monthly = seats * SEAT_PRICE;
  const wallet = seats * SEAT_WALLET_CREDIT;

  const requestTopup = () => {
    const text = `היי, אני רוצה לרכוש מנוי ריאלטיז נדל"ן עבור ${seats} מושבים (₪${monthly} לחודש, כולל ₪${wallet} קרדיט פרימיום בארנק).`;
    const url = `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4 mt-5">
      <Card>
        <CardContent className="space-y-5">
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5 text-center">
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold tabular-nums text-primary">{formatIls(SEAT_PRICE)}</span>
              <span className="text-xs text-muted-foreground">/ חודש / מתווך</span>
            </div>
            <p className="mt-3 text-sm font-bold text-foreground text-center">
              כולל מעטפת AI מלאה, ניהול לידים, חיבור להומלי, יד2, מדל״ן, לווטסאפ ולכל הרשתות החברתיות שלכם בקליק.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-right text-sm whitespace-nowrap">מספר מתווכים</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setSeats(Math.max(1, seats - 1))}>-</Button>
              <Input
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 text-center"
              />
              <Button variant="outline" size="icon" onClick={() => setSeats(seats + 1)}>+</Button>
            </div>
          </div>

          <Button onClick={requestTopup} size="lg" className="w-full">
            פתח חלון תשלום ב-WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
