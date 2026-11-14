import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useInboxFavorites, type InboxFavoriteKind } from '@/hooks/useInboxFavorites';

export function ChatFavoriteButton({ kind, id, label = false }: { kind: InboxFavoriteKind; id: string; label?: boolean }) {
  const favorites = useInboxFavorites();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const saved = favorites.has(kind, id);
  const change = async () => { if (busy) return; setBusy(true); try { if (await favorites.toggle(kind, id)) setConfirm(false); } finally { setBusy(false); } };
  return <><Button variant="ghost" size={label ? 'default' : 'icon'} disabled={busy} aria-label={saved ? 'הסרה מהמועדפים' : 'שמירת שיחה במועדפים'} title={saved ? 'הסרה מהמועדפים' : 'שמירת שיחה במועדפים'} onClick={event => { event.stopPropagation(); if (saved) setConfirm(true); else void change(); }}><Star className={`h-5 w-5 ${saved ? 'fill-current text-primary' : ''}`} />{label && (saved ? 'הסרה מהמועדפים' : 'שמירת שיחה במועדפים')}</Button>
    <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>להסיר מהמועדפים?</AlertDialogTitle><AlertDialogDescription>השיחה תישאר ברשימת הצ׳אטים.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-row justify-between gap-3"><AlertDialogCancel disabled={busy}>ביטול</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void change(); }}>הסרה</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}