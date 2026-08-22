// Legacy /social-connect route.
//
// Social connections now live in the Connections tab of the profile screen and
// run directly against the Meta Graph API (Facebook Page + Instagram Business)
// and Green API for WhatsApp QR sessions. This page only forwards there so old
// deep links (/social-connect?connect=facebook) keep working.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function SocialConnect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const connect = searchParams.get('connect');
    const qs = new URLSearchParams({ tab: 'connections' });
    if (connect) qs.set('connect', connect);
    navigate(`/profile?${qs.toString()}`, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div dir="rtl" className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      מעביר להגדרות החיבורים…
    </div>
  );
}
