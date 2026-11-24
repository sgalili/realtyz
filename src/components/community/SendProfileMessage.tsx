import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { useEffect } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { messagePath, rememberPendingMessage, takePendingMessage } from '@/lib/pendingCommunityMessage';

function SendProfileMessageInner({ recipientId }: { recipientId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (user?.id === recipientId) return null;
  return <Button className="gap-2" onClick={() => { if (user) navigate(messagePath(recipientId)); else { rememberPendingMessage(recipientId); navigate('/auth'); } }}><MessageCircle className="h-4 w-4" />שליחת הודעה</Button>;
}

/** After sign-in, reopens the chat a guest asked for. */
export function PendingMessageResume() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!user || loading) return; const id = takePendingMessage(); if (id && id !== user.id) navigate(messagePath(id)); }, [user, loading, navigate]);
  return null;
}

/** Brokers-only mode has no broker-to-broker or community messaging. */
export function SendProfileMessage(props: Parameters<typeof SendProfileMessageInner>[0]) {
  const brokersOnly = useBrokersOnly();
  return brokersOnly ? null : <SendProfileMessageInner {...props} />;
}
