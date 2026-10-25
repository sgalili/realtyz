import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { SelectBox, SelectModeToggle } from '@/components/ui/multi-select-controls';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const roleOptions: AppRole[] = ['user', 'moderator', 'admin', 'super_admin'];
export function SuperAdminUsersTable() {
  const { isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const profiles = useQuery({ queryKey: ['admin-profiles'], enabled: isSuperAdmin, queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }});
  const roles = useQuery({ queryKey: ['admin-all-roles'], enabled: isSuperAdmin, queryFn: async () => {
    const { data, error } = await supabase.from('user_roles').select('user_id,role');
    if (error) throw error;
    return data ?? [];
  }});
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['admin-profiles'] }),
    qc.invalidateQueries({ queryKey: ['admin-all-roles'] }),
    qc.invalidateQueries({ queryKey: ['workspaces'] }),
    qc.invalidateQueries({ queryKey: ['admin-system-stats'] }),
  ]);
  const edit = useMutation({ mutationFn: async (action: { id: string; suspend?: boolean; role?: AppRole; enable?: boolean }) => {
    const response = action.role
      ? action.enable ? await supabase.from('user_roles').insert({ user_id: action.id, role: action.role }) : await supabase.from('user_roles').delete().eq('user_id', action.id).eq('role', action.role)
      : await supabase.from('profiles').update({ is_suspended: action.suspend }).eq('id', action.id);
    if (response.error) throw response.error;
  }, onSuccess: refresh, onError: () => toast.error('עדכון המשתמש נכשל') });
  const deletion = useMutation({ mutationFn: async (ids: string[]) => {
    const results: { user_id: string; status: string }[] = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const { data, error } = await supabase.functions.invoke('super-admin-delete-users', { body: { user_ids: ids.slice(offset, offset + 50) } });
      if (error || !Array.isArray(data?.results)) throw error ?? new Error('delete_failed');
      results.push(...data.results);
    }
    return results;
  }, onSuccess: async results => {
    const removed = results.filter(r => r.status === 'deleted').map(r => r.user_id);
    setSelected(current => current.filter(id => !removed.includes(id)));
    setPendingIds([]);
    await refresh();
    if (removed.length) toast.success(`${removed.length} חשבונות נמחקו לצמיתות`);
    if (results.some(r => r.status !== 'deleted')) toast.error('חלק מהחשבונות לא נמחקו. רעננו ונסו שוב.');
  }, onError: async () => { await refresh(); toast.error('המחיקה לא הושלמה. רעננו ובדקו את הרשימה.'); } });
  if (!isSuperAdmin) return null;
  const rows = (profiles.data ?? []).filter(p => `${p.full_name ?? ''} ${p.email ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const protectedId = (id: string) => !roles.data || id === user?.id || roles.data.some(r => r.user_id === id && r.role === 'super_admin');
  const eligible = rows.filter(p => !protectedId(p.id)).map(p => p.id);
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(v => v !== id) : [...current, id]);
  return <section dir="rtl" className="space-y-3">
    <h2 className="text-lg font-bold">כל המשתמשים</h2>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-sm" aria-label="חיפוש משתמשים" placeholder="חפש לפי אימייל או שם..." value={search} onChange={e => setSearch(e.target.value)} />
      <SelectModeToggle active={selecting} onToggle={() => { setSelecting(!selecting); setSelected([]); }} total={rows.length} count={selected.length} onSelectAll={() => setSelected(eligible)} />
      {selecting && <Button variant="destructive" size="sm" disabled={!selected.length || deletion.isPending} onClick={() => setPendingIds([...selected])}><Trash2 className="h-4 w-4" />מחיקת {selected.length} משתמשים</Button>}
    </div>
    {profiles.isLoading ? <p role="status">טוען משתמשים…</p> : profiles.isError || roles.isError ? <p role="alert">טעינת המשתמשים נכשלה</p> : <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow>{selecting && <TableHead>בחירה</TableHead>}<TableHead>אימייל</TableHead><TableHead>שם מלא</TableHead><TableHead>הרשמה</TableHead><TableHead>הרשאות</TableHead><TableHead>פעיל</TableHead><TableHead>פעולות</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(p => {
        const userRoles = (roles.data ?? []).filter(r => r.user_id === p.id).map(r => r.role);
        return <TableRow key={p.id}>
          {selecting && <TableCell>{!protectedId(p.id) && <SelectBox label={`בחירת ${p.full_name || p.email}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />}</TableCell>}
          <TableCell dir="ltr" className="text-xs">{p.email || '—'}</TableCell><TableCell>{p.full_name || '—'}</TableCell><TableCell>{new Date(p.created_at).toLocaleDateString('he-IL')}</TableCell>
          <TableCell><div className="flex flex-wrap gap-1">{userRoles.map(r => <Badge key={r} variant="secondary">{r}</Badge>)}</div></TableCell>
          <TableCell><Switch aria-label={`גישה עבור ${p.full_name}`} checked={!p.is_suspended} disabled={edit.isPending} onCheckedChange={v => edit.mutate({ id: p.id, suspend: !v })} /></TableCell>
          <TableCell><div className="flex flex-wrap gap-1">{roleOptions.map(role => <Button key={role} size="sm" variant={userRoles.includes(role) ? 'default' : 'outline'} className="h-7 px-2 text-xs" disabled={edit.isPending} onClick={() => edit.mutate({ id: p.id, role, enable: !userRoles.includes(role) })}>{userRoles.includes(role) ? '−' : '+'} {role}</Button>)}</div></TableCell>
        </TableRow>;
      })}{!rows.length && <TableRow><TableCell colSpan={selecting ? 7 : 6} className="text-center">לא נמצאו משתמשים</TableCell></TableRow>}</TableBody>
    </Table></div>}
    <AlertDialog open={!!pendingIds.length} onOpenChange={open => { if (!open && !deletion.isPending) setPendingIds([]); }}>
      <AlertDialogContent dir="rtl"><AlertDialogHeader className="text-right"><AlertDialogTitle>למחוק {pendingIds.length} משתמשים לצמיתות?</AlertDialogTitle><AlertDialogDescription>החשבונות, הנתונים הפעילים והקבצים שלהם יימחקו ללא אפשרות שחזור.</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-40 overflow-y-auto text-sm">{pendingIds.map(id => <li key={id}>{profiles.data?.find(p => p.id === id)?.full_name || profiles.data?.find(p => p.id === id)?.email}</li>)}</ul>
        <AlertDialogFooter><AlertDialogCancel disabled={deletion.isPending}>ביטול</AlertDialogCancel><Button variant="destructive" disabled={deletion.isPending} onClick={() => deletion.mutate([...pendingIds])}>{deletion.isPending ? 'מוחק…' : 'מחיקה לצמיתות'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}