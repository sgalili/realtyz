import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { messagePath, rememberPendingMessage, takePendingMessage } from '@/lib/pendingCommunityMessage';

export function SendProfileMessage({ recipientId }: { recipientId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (user?.id === recipientId) return null;
  return <Button className="gap-2" onClick={() => { if (user) navigate(messagePath(recipientId)); else { rememberPendingMessage(recipientId); navigate('/auth'); } }}><MessageCircle className="h-4 w-4" />שלח הודעה</Button>;
}

/** After sign-in, reopens the chat a guest asked for. */
export function PendingMessageResume() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!user || loading) return; const id = takePendingMessage(); if (id && id !== user.id) navigate(messagePath(id)); }, [user, loading, navigate]);
  return null;
}
