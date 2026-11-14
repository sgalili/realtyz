import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Star, Loader2 } from 'lucide-react';
import { X } from 'lucide-react';
import { ChatFavoriteButton } from './ChatFavoriteButton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useInboxFavorites, type InboxFavoriteKind } from '@/hooks/useInboxFavorites';

export function InboxFavoritesDialog({ open, onOpenChange, community = false }: { open: boolean; onOpenChange: (open: boolean) => void; community?: boolean }) {
  const favorites = useInboxFavorites();
  const navigate = useNavigate();
  const rows = (favorites.data ?? []).filter(r => community ? r.target_kind.startsWith('peer') || r.target_kind === 'group' : !r.target_kind.startsWith('peer') && r.target_kind !== 'group');
  const details = useQuery({ queryKey: ['inbox-favorite-details', rows[0]?.user_id, rows[0]?.workspace_owner_id, community, rows.map(r => `${r.target_kind}:${r.target_id}`).join(',' )], enabled: open && rows.length > 0, staleTime: 0, queryFn: async () => Promise.all(rows.map(async row => {
    if (row.target_kind === 'group') {
      const { data, error } = await supabase.from('community_chat_groups').select('name').eq('id', row.target_id).maybeSingle();
      if (error) throw error;
      return { ...row, label: data?.name ?? 'קבוצה שמורה', path: `/inbox?section=community&group=${row.target_id}` };
    }
    if (row.target_kind === 'lead') {
      const { data, error } = await supabase.from('leads').select('full_name').eq('id', row.target_id).maybeSingle(); if (error) throw error;
      return { ...row, label: data?.full_name ?? 'שיחה שמורה', path: `/inbox?lead=${row.target_id}` };
    }
    if (row.target_kind === 'message') {
      const { data, error } = await supabase.from('messages').select('content,lead_id,metadata').eq('id', row.target_id).maybeSingle(); if (error) throw error;
      const metadata = data?.metadata;
      const phone = metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof metadata.sender_phone === 'string' ? metadata.sender_phone : null;
      return { ...row, label: data?.content ?? 'הודעה אינה זמינה', path: data?.lead_id ? `/inbox?lead=${data.lead_id}&message=${row.target_id}` : phone ? `/inbox?chat=${encodeURIComponent(`phone:${phone}`)}&message=${row.target_id}` : null };
    }
    if (row.target_kind === 'peer') {
      const { data, error } = await supabase.rpc('community_profile_cards', { _ids: [row.target_id] }); if (error) throw error;
      return { ...row, label: data?.[0]?.full_name ?? 'שיחת קהילה', path: `/inbox?section=community&community=${row.target_id}` };
    }
    const { data, error } = await supabase.from('community_chat_messages').select('content,sender_id,recipient_id').eq('id', row.target_id).maybeSingle(); if (error) throw error;
    const peer = data?.sender_id === row.user_id ? data.recipient_id : data?.sender_id;
    return { ...row, label: data?.content ?? 'הודעה אינה זמינה', path: peer ? `/inbox?section=community&community=${peer}` : null };
  })) });
  if (!open) return null;
  return <section dir="rtl" aria-label="מועדפים" className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col bg-background text-base">
    <header className="flex shrink-0 items-center justify-between border-b border-border p-3"><h2 className="text-lg font-semibold">מועדפים</h2><Button variant="ghost" size="icon" aria-label="סגירת מועדפים" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button></header>
    {(favorites.isLoading || details.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
    {(favorites.isError || details.isError) && <p role="alert" className="text-destructive">טעינת המועדפים נכשלה</p>}
    {!favorites.isLoading && !rows.length && <p className="text-muted-foreground">אין מועדפים שמורים</p>}
    <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">{details.data?.filter(row => rows.some(r => r.target_id === row.target_id && r.target_kind === row.target_kind)).map(row => <div key={`${row.target_kind}:${row.target_id}`} className="flex items-center gap-2 py-3"><Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-pre-wrap break-words text-start" disabled={!row.path} onClick={() => { if (row.path) { onOpenChange(false); navigate(row.path); } }}>{row.label}</Button><ChatFavoriteButton kind={row.target_kind as InboxFavoriteKind} id={row.target_id} /></div>)}</div>
  </section>;
}