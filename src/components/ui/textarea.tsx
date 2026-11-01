import * as React from "react";

import { cn } from "@/lib/utils";
import { usePersonalLanguage } from '@/i18n/personalLanguage';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  const { command } = usePersonalLanguage();
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-transparent outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
      placeholder={command(props.placeholder)}
      aria-label={command(props['aria-label'])}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
