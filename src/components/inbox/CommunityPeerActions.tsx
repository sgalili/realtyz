import { useState } from 'react';
import { Ban, Power, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityConversationSettings } from '@/hooks/useCommunityConversationSettings';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChatFavoriteButton } from './ChatFavoriteButton';
import { RitaChatButton } from './RitaChatButton';
import { DealTermsDialog } from './DealTermsDialog';
import { toast } from 'sonner';

/** Same peer actions for directory cards, conversation cards and open headers. */
export function CommunityPeerActions({ id, name, onHide }: { id: string; name: string | null; onHide?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const settings = useCommunityConversationSettings('peer');
  const [confirm, setConfirm] = useState<'block' | 'hide' | null>(null);
  const [busy, setBusy] = useState(false);
  const blocks = useQuery({ queryKey: ['community-blocks', user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from('community_user_blocks').select('blocked_id');
    if (error) throw error;
    return new Set(data.map(row => row.blocked_id));
  } });
  const blocked = blocks.data?.has(id) === true;
  const execute = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (confirm === 'hide') {
        if (!(await settings.change(id, 'hide'))) return;
        onHide?.();
      } else {
        const { error } = blocked
          ? await supabase.from('community_user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id)
          : await supabase.from('community_user_blocks').insert({ blocker_id: user.id, blocked_id: id });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['community-blocks', user.id] });
      }
      setConfirm(null);
    } catch { toast.error('הפעולה לא נשמרה'); }
    finally { setBusy(false); }
  };
  return <>
    <ChatFavoriteButton label kind="peer" id={id} />
    <DealTermsDialog peerId={id} peerName={name} label />
    <Button variant="ghost" disabled={blocks.isLoading || blocks.isError} onClick={() => setConfirm('block')}><Ban className="h-5 w-5" />{blocked ? 'הסרת חסימה' : 'חסימת משתמש'}</Button>
    <RitaChatButton kind="peer" target={id} label />
    <Button variant="ghost" disabled={!!settings.busy} onClick={() => void settings.change(id, 'autopilot', !settings.enabled(id))}><Power className="h-5 w-5" />{settings.enabled(id) ? 'כיבוי ריטה לשיחה זו' : 'הפעלת ריטה לשיחה זו'}</Button>
    <Button variant="ghost" className="text-destructive" onClick={() => setConfirm('hide')}><Trash2 className="h-5 w-5" />הסרת שיחה</Button>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>{confirm === 'hide' ? 'להסיר את השיחה מהרשימה?' : blocked ? 'להסיר את החסימה?' : 'לחסום את המשתמש?'}</AlertDialogTitle><AlertDialogDescription>{confirm === 'hide' ? 'ההיסטוריה נשמרת למשתתפים. הודעה חדשה תחזיר את השיחה לרשימה. ריטה תכובה לשיחה זו.' : `${name ?? 'חבר הקהילה'} ${blocked ? 'יוכל לשלוח הודעות שוב.' : 'לא יוכל לשלוח לך הודעות פרטיות.'}`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>ביטול</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void execute(); }}>{confirm === 'hide' ? 'הסרה' : blocked ? 'הסרת חסימה' : 'חסימה'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}