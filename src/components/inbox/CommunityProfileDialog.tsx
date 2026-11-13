import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { communityProfilePath } from '@/pages/CommunityProfilePage';

/** Public profiles are a dedicated page; this keeps existing callers working by navigating there. */
export function CommunityProfileDialog({ userId, onOpenChange }: { userId: string | null; fallbackName?: string | null; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!userId) return;
    navigate(communityProfilePath(userId));
    onOpenChange(false);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
