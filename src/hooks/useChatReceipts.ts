import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useActiveWorkspaceOwnerId } from './useWorkspace';
import type { DeliveryStatus } from '@/lib/chatReceipts';

type ReceiptMessage = { id: string; incoming: boolean };
export function useChatReceipts(kind: 'inbox' | 'peer' | 'group', messages: ReceiptMessage[], reading: boolean) {
  const { user } = useAuth();
  const workspace = useActiveWorkspaceOwnerId();
  const client = useQueryClient();
  const ids = [...new Set(messages.map(m => m.id).filter(id => /^[0-9a-f-]{36}$/i.test(id)))].slice(-250);
  const signature = ids.join(',');
  const incoming = messages.filter(m => m.incoming && ids.includes(m.id)).map(m => m.id);
  const incomingSignature = incoming.join(',');
  const query = useQuery({ queryKey: ['chat-receipts', user?.id, workspace, kind, signature], enabled: !!user && ids.length > 0, refetchInterval: 3000, queryFn: async () => {
    const { data, error } = await supabase.rpc('chat_receipt_states', { _kind: kind, _ids: ids });
    if (error) throw error;
    return data;
  } });
  useEffect(() => {
    if (!user || !incomingSignature) return;
    const acknowledge = async () => {
      const { error } = await supabase.rpc('acknowledge_chat_messages', { _kind: kind, _ids: incomingSignature.split(','), _read: reading && document.visibilityState === 'visible' });
      if (!error) void client.invalidateQueries({ queryKey: ['chat-receipts', user.id, workspace] });
    };
    void acknowledge();
    document.addEventListener('visibilitychange', acknowledge);
    return () => document.removeEventListener('visibilitychange', acknowledge);
  }, [kind, user?.id, workspace, incomingSignature, reading, client]);
  const states = useMemo(() => new Map(query.data?.map(row => [row.message_id, row])), [query.data]);
  return { isRead: (id: string) => states.get(id)?.viewer_read === true, status: (id: string): DeliveryStatus => (states.get(id)?.delivery_status as DeliveryStatus | undefined) ?? 'sent' };
}