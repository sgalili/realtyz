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
  const { data: health } = useFacebookHealth();
  const needsReconnect = health?.needsReconnect === true;

  // Strict hide: the backend only sets needs_reconnect when zero bound pages
  // have a working token. If it is false — or any page binding is healthy —
  // the banner must disappear immediately.
  if (!needsReconnect || health?.pageConnected) return null;

  return (
    <div
      dir="rtl"
      role="alert"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-right"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">החיבור לפייסבוק אינו פעיל</p>
        <p className="text-xs text-muted-foreground">
          {data.reason} פרסום לעמוד ולאינסטגרם לא יעבוד עד לחיבור מחדש.
        </p>
      </div>
      <Button asChild size="sm" className="gap-1">
        <Link to="/profile?tab=connections">
          <Facebook className="h-4 w-4" /> התחברות מחדש
        </Link>
      </Button>
    </div>
  );
}

export default FacebookConnectionBanner;
