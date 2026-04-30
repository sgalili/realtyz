import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { DEMO_UPGRADE_EVENT } from "@/lib/demoGuard";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /* Legacy aliases kept so existing pages keep compiling */
        gold: "bg-primary text-primary-foreground hover:bg-primary/90",
        navy: "bg-primary text-primary-foreground hover:bg-primary/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const getButtonText = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getButtonText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return getButtonText(node.props.children);
  return "";
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const guardedOnClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      const label = getButtonText(props.children).toLowerCase();
      const action = `${props["aria-label"] ?? ""} ${props.title ?? ""} ${label}`.toLowerCase();
      const isWriteAction = /save|send|delete|invite|שמור|שמירה|שמור|שלח|שליחה|מחק|מחיקה|הזמן|הזמנה/.test(action);
      const isSubmitAction = props.type === "submit";
      const isGuestDemo = typeof window !== "undefined"
        && window.localStorage.getItem("kalpiz-demo-mode") === "true"
        && window.localStorage.getItem("kalpiz-authenticated-session") !== "true";

      if (!isSubmitAction && isWriteAction && isGuestDemo) {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent(DEMO_UPGRADE_EVENT, { detail: { reason: "guarded-button" } }));
        return;
      }

      props.onClick?.(event);
    };

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} onClick={guardedOnClick} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
