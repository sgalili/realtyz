import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClosingRoomDialog } from '@/components/dealroom/ClosingRoomDialog';

type SignatureLead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  interest_tag?: string | null;
};

/**
 * Opens the digital-signature flow pre-set to the pre-tour agreement so a
 * broker can send a signing link before showing a property. The signed PDF is
 * stored on the contact record, so history stays visible in the CRM.
 */
export function DigitalSignatureButton({
  lead,
  listingId,
  label = 'חתימה דיגיטלית',
  size = 'sm',
  variant = 'outline',
  className,
  iconOnly = false,
}: {
  lead: SignatureLead | null;
  listingId?: string | null;
  label?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  className?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={iconOnly ? 'icon' : size}
        variant={variant}
        className={className}
        disabled={!lead}
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <FileSignature className={iconOnly ? 'h-4 w-4' : 'h-4 w-4 ml-1.5'} />
        {!iconOnly && label}
      </Button>

      <ClosingRoomDialog
        lead={lead}
        open={open}
        onOpenChange={setOpen}
        defaultTemplate="tour_agreement"
        defaultListingId={listingId ?? undefined}
      />
    </>
  );
}
