import { useEffect, useState } from 'react';
import { useMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { BrandIcon } from '@/components/BrandIcon';
import { cn } from '@/lib/utils';

/** Effective workspace/shared Page photo, not cloud-profile or token health evidence. */
export function PageAvatarIcon({ className }: { className?: string }) {
  const { data } = useMetaPageBinding();
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [data?.pageId, data?.pageAvatarUrl]);
  if (data?.pageAvatarUrl && !broken) {
    return (
      <img src={data.pageAvatarUrl} alt={data.pageName || 'עמוד פייסבוק'} title={data.pageName || undefined}
        onError={() => setBroken(true)} referrerPolicy="no-referrer"
        className={cn('shrink-0 rounded-full border border-border object-cover', className)} />
    );
  }
  return <BrandIcon name="facebook" className={cn('text-primary', className)} />;
}
