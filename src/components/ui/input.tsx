import * as React from "react";

import { cn } from "@/lib/utils";
import { usePersonalLanguage } from '@/i18n/personalLanguage';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const { command } = usePersonalLanguage();
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        placeholder={command(props.placeholder)}
        aria-label={command(props['aria-label'])}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
