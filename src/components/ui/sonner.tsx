import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      offset={72}
      duration={6000}
      closeButton
      swipeDirections={["top", "right", "bottom", "left"]}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-lg group-[.toaster]:border-primary-glow/30 group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-primary-foreground/75",
          actionButton: "group-[.toast]:bg-primary-glow group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-primary-foreground/10 group-[.toast]:text-primary-foreground",
          closeButton:
            "group-[.toast]:!right-auto group-[.toast]:!left-2 group-[.toast]:!top-2 group-[.toast]:!translate-x-0 group-[.toast]:!translate-y-0 group-[.toast]:!bg-white group-[.toast]:!text-primary group-[.toast]:!border group-[.toast]:!border-primary/40 group-[.toast]:!opacity-100 group-[.toast]:!h-5 group-[.toast]:!w-5 hover:group-[.toast]:!bg-white/90",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
