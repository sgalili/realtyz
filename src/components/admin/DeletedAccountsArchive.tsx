import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPhoneDisplay } from '@/lib/formatPhone';

export function DeletedAccountsArchive() {
  const { isSuperAdmin } = useUserRole();
  const archive = useQuery({
    queryKey: ['deleted-accounts-archive'], enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('deleted_accounts_archive')
        .select('id,full_name,phone,email,deleted_at,reason').order('deleted_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!isSuperAdmin) return null;
  return <Card dir="rtl">
    <CardHeader><CardTitle>ארכיון חשבונות שנמחקו</CardTitle></CardHeader>
    <CardContent>
      {archive.isLoading ? <p role="status">טוען רשומות…</p> : archive.isError ? <p role="alert" className="text-destructive">טעינת הארכיון נכשלה.</p> :
        <Table><TableHeader><TableRow><TableHead>שם</TableHead><TableHead>טלפון</TableHead><TableHead>אימייל</TableHead><TableHead>תאריך</TableHead><TableHead>מצב</TableHead></TableRow></TableHeader>
          <TableBody>{archive.data?.map(row => <TableRow key={row.id}>
            <TableCell>{row.full_name || '—'}</TableCell><TableCell dir="ltr">{formatPhoneDisplay(row.phone) || '—'}</TableCell>
            <TableCell>{row.email || '—'}</TableCell><TableCell>{new Date(row.deleted_at).toLocaleDateString('he-IL')}</TableCell>
            <TableCell>{row.reason === 'self_request_pending' ? 'מחיקת הכניסה טרם הושלמה' : 'נמחק'}</TableCell>
          </TableRow>)}{archive.data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center">אין רשומות מחיקה</TableCell></TableRow>}</TableBody>
        </Table>}
    </CardContent>
  </Card>;
}