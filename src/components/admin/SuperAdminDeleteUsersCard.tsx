import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Result = { phone: string; status: string };
const STATUS: Record<string, string> = {
  deleted: 'נמחק לצמיתות', found: 'נמצא', not_found: 'לא נמצא', skipped_self: 'דולג (החשבון שלך)',
  skipped_super_admin: 'דולג (מנהל על)', purge_failed: 'מחיקת הנתונים נכשלה', delete_failed: 'מחיקת החשבון נכשלה',
};

export function SuperAdminDeleteUsersCard() {
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const phones = text.split(/[\s,;]+/).map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 9);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('super-admin-delete-users', { body: { phones } });
      if (error) throw error;
      return (data?.results ?? []) as Result[];
    },
    onSuccess: (r) => { setResults(r); toast.success('הפעולה הושלמה'); },
    onError: () => toast.error('המחיקה נכשלה'),
  });

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" />מחיקת משתמשים לצמיתות</CardTitle>
        <CardDescription>הזינו מספרי טלפון (מופרדים בפסיק או בשורה). החשבון וכל הנתונים שלו יימחקו ללא אפשרות שחזור.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder="050-1234567, 052-7654321" rows={3} />
        <Button variant="destructive" disabled={!phones.length || run.isPending} onClick={() => setConfirm(true)}>
          {run.isPending ? 'מוחק…' : `מחיקת ${phones.length} משתמשים`}
        </Button>
        {!!results.length && (
          <ul className="space-y-1 text-sm">
            {results.map((r) => <li key={r.phone + r.status} className="flex justify-between"><bdi dir="ltr">0{r.phone}</bdi><span>{STATUS[r.status] ?? r.status}</span></li>)}
          </ul>
        )}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>למחוק {phones.length} משתמשים לצמיתות?</AlertDialogTitle>
            <AlertDialogDescription>לא ניתן לבטל פעולה זו.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start sm:space-x-0">
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => run.mutate()}>מחיקה</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
