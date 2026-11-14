import { Landmark } from 'lucide-react';
import type { GrowPaymentMethod } from '../../../supabase/functions/_shared/growPayment';
import bit from '@/assets/payments/bit.jpg.asset.json';
import applePay from '@/assets/payments/apple-pay.png.asset.json';
import appleMark from '@/assets/payments/apple-pay-mark.png.asset.json';
import googlePay from '@/assets/payments/google-pay.svg.asset.json';
import mastercard from '@/assets/payments/mastercard.svg.asset.json';

export function PaymentMethodLogo({ method }: { method: GrowPaymentMethod }) {
  const asset = method === 'bit' ? bit : method === 'apple_pay' ? applePay : method === 'google_pay' ? googlePay : method === 'card' ? mastercard : null;
  return <span className="payment-logo inline-flex h-10 w-16 shrink-0 items-center justify-center rounded-md">
    {method === 'apple_pay' ? <span className="inline-flex items-center gap-0.5" dir="ltr"><img src={appleMark.url} alt="" className="h-6 w-5 object-contain" /><img src={applePay.url} alt="" className="h-7 w-9 object-contain" /></span> : asset ? <img src={asset.url} alt="" className={method === 'bit' ? 'h-9 w-9 rounded-md object-contain' : 'h-9 w-14 object-contain'} /> : <Landmark className="h-7 w-7 text-foreground" aria-hidden />}
  </span>;
}