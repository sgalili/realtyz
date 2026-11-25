import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Super Admin internal note per account; RLS limits rows to super_admin. */
export function AdminAccountNotes({ userId, name }: { userId: string; name: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const key = ['admin-account-note', userId];
  const note = useQuery({ queryKey: key, queryFn: async () => {
    const { data, error } = await supabase.from('admin_account_notes').select('note').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data?.note ?? '';
  } });
  useEffect(() => { if (open) setText(note.data ?? ''); }, [open, note.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('admin_account_notes').upsert({ user_id: userId, note: text.trim(), updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('ההערה נשמרה'); setOpen(false); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const has = !!note.data?.trim();
  return <>
    <Button size="icon" variant="ghost" className={`h-8 w-8 shrink-0 ${has ? 'text-primary' : 'text-muted-foreground'}`} aria-label={`הערות פנימיות על ${name || 'החשבון'}`} title={has ? note.data ?? '' : 'הוספת הערה פנימית'} onClick={() => setOpen(true)}><NotebookPen className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-md text-right">
        <DialogHeader><DialogTitle>הערות פנימיות · {name || 'ללא שם'}</DialogTitle></DialogHeader>
        <DialogDescription>גלוי רק לסופר אדמין.</DialogDescription>
        <Textarea rows={6} value={text} onChange={e => setText(e.target.value)} placeholder="כתבו כאן הערה" />
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}שמירה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
