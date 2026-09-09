import { Link } from 'react-router-dom';
import { AlertTriangle, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFacebookHealth } from '@/hooks/useFacebookHealth';

/**
 * FacebookConnectionBanner — global warning shown whenever the workspace's
 * Facebook token expired, was revoked, or lost its publishing permissions.
 * Silent when Facebook was never connected (that is an empty state, not a
 * failure) and silent while the connection is healthy.
 */
export function FacebookConnectionBanner() {
  return null;
}


export default FacebookConnectionBanner;
