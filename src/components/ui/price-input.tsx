import * as React from "react";
import { Input } from "@/components/ui/input";

/** Price field: displays 1,000,000 while emitting raw digits via onChange (e.target.value). */
type Props = Omit<React.ComponentProps<"input">, "type" | "value"> & { value?: string | number | null };

export const formatPrice = (v: string | number | null | undefined) => {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits).toLocaleString("en-US") : "";
};

export const PriceInput = React.forwardRef<HTMLInputElement, Props>(({ value, onChange, ...props }, ref) => (
  <Input
    ref={ref}
    {...props}
    type="text"
    inputMode="numeric"
    dir="ltr"
    value={formatPrice(value)}
    onChange={(e) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      onChange?.({ ...e, target: { ...e.target, value: raw }, currentTarget: { ...e.currentTarget, value: raw } } as any);
    }}
  />
));
PriceInput.displayName = "PriceInput";
