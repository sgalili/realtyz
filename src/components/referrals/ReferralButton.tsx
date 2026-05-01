import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Handshake } from "lucide-react";
import { ReferralDialog, type ReferralSubject } from "./ReferralDialog";

interface Props extends Omit<ButtonProps, "onClick"> {
  subject: ReferralSubject;
  label?: string;
}

export function ReferralButton({ subject, label = "הפניה", ...btn }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        {...btn}
        onClick={() => setOpen(true)}
      >
        <Handshake className="h-4 w-4 text-primary" />
        {label}
      </Button>
      <ReferralDialog open={open} onOpenChange={setOpen} subject={subject} />
    </>
  );
}
