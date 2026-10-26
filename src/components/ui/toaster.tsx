import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { usePersonalLanguage, localizeControlNode } from '@/i18n/personalLanguage';

export function Toaster() {
  const { toasts } = useToast();
  const { gender } = usePersonalLanguage();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{localizeControlNode(title, gender)}</ToastTitle>}
              {description && <ToastDescription>{localizeControlNode(description, gender)}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
