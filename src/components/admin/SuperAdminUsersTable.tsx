import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SelectBox, SelectModeToggle } from '@/components/ui/multi-select-controls';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Trash2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'סופר אדמין', admin: 'מנהל', moderator: 'מנחה', managing_broker: 'מתווך מנהל', agent: 'סוכן',
  lead_agent: 'סוכן לידים', junior_agent: 'סוכן זוטר', assistant: 'עוזר', affiliate: 'שותף', developer: 'יזם',
  property_owner: 'בעל נכס', property_seeker: 'מחפש נכס', user: 'משתמש',
};
const ROLE_ORDER = Object.keys(ROLE_LABELS) as AppRole[];
const primaryRole = (roles: string[]) => ROLE_ORDER.find(r => roles.includes(r));

type EditDraft = { id: string; full_name: string; email: string; phone: string; city: string; gender: string; roles: AppRole[]; originalRoles: AppRole[] };

export function SuperAdminUsersTable() {
  const { isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<EditDraft | null>(null);
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
  const saveDraft = useMutation({ mutationFn: async (d: EditDraft) => {
    const { error } = await supabase.from('profiles').update({
      full_name: d.full_name.trim() || null, email: d.email.trim() || null, phone: d.phone.trim() || null,
      city: d.city.trim() || null, gender: d.gender || null,
    } as any).eq('id', d.id);
    if (error) throw error;
    const add = d.roles.filter(r => !d.originalRoles.includes(r));
    const remove = d.originalRoles.filter(r => !d.roles.includes(r));
    if (add.length) { const r = await supabase.from('user_roles').insert(add.map(role => ({ user_id: d.id, role }))); if (r.error) throw r.error; }
    if (remove.length) { const r = await supabase.from('user_roles').delete().eq('user_id', d.id).in('role', remove); if (r.error) throw r.error; }
  }, onSuccess: async () => { setDraft(null); await refresh(); toast.success('פרטי המשתמש נשמרו'); }, onError: () => toast.error('שמירת המשתמש נכשלה') });
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
  const rolesOf = (id: string) => (roles.data ?? []).filter(r => r.user_id === id).map(r => r.role as AppRole);
  const openEdit = (p: any) => { const r = rolesOf(p.id); setDraft({ id: p.id, full_name: p.full_name ?? '', email: p.email ?? '', phone: p.phone ?? '', city: p.city ?? '', gender: p.gender ?? '', roles: r, originalRoles: r }); };
  return <section dir="rtl" className="space-y-3">
    <h2 className="text-lg font-bold">כל המשתמשים</h2>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-sm" aria-label="חיפוש משתמשים" placeholder="חפש לפי אימייל, שם או טלפון..." value={search} onChange={e => setSearch(e.target.value)} />
      <SelectModeToggle active={selecting} onToggle={() => { setSelecting(!selecting); setSelected([]); }} total={rows.length} count={selected.length} onSelectAll={() => setSelected(eligible)} />
      {selecting && <Button variant="destructive" size="sm" disabled={!selected.length || deletion.isPending} onClick={() => setPendingIds([...selected])}><Trash2 className="h-4 w-4" />מחיקת {selected.length} משתמשים</Button>}
    </div>
    {profiles.isLoading ? <p role="status">טוען משתמשים…</p> : profiles.isError || roles.isError ? <p role="alert">טעינת המשתמשים נכשלה</p> : <div className="overflow-x-auto"><Table>
      <TableHeader><TableRow>{selecting && <TableHead>בחירה</TableHead>}<TableHead>שם מלא</TableHead><TableHead>אימייל</TableHead><TableHead>טלפון</TableHead><TableHead>סוג משתמש</TableHead><TableHead>הרשאות</TableHead><TableHead>הרשמה</TableHead><TableHead>פעיל</TableHead><TableHead>פעולות</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(p => {
        const userRoles = rolesOf(p.id);
        const main = primaryRole(userRoles);
        return <TableRow key={p.id}>
          {selecting && <TableCell>{!protectedId(p.id) && <SelectBox label={`בחירת ${p.full_name || p.email}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />}</TableCell>}
          <TableCell className="whitespace-nowrap">{p.full_name || '—'}</TableCell>
          <TableCell dir="ltr" className="text-xs">{p.email || '—'}</TableCell>
          <TableCell dir="ltr" className="text-xs whitespace-nowrap">{p.phone || '—'}</TableCell>
          <TableCell><Badge variant="secondary" className="whitespace-nowrap">{main ? ROLE_LABELS[main] : '—'}</Badge></TableCell>
          <TableCell>
            <Select value="" onValueChange={v => edit.mutate({ id: p.id, role: v as AppRole, enable: !userRoles.includes(v as AppRole) })} disabled={edit.isPending}>
              <SelectTrigger dir="rtl" className="h-8 w-40 text-xs" aria-label={`הרשאות עבור ${p.full_name || p.email}`}><SelectValue placeholder={`${userRoles.length} הרשאות`} /></SelectTrigger>
              <SelectContent dir="rtl">{ROLE_ORDER.map(r => <SelectItem key={r} value={r} className="text-right">
                <span className="flex items-center gap-2">{userRoles.includes(r) ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="w-3.5" />}{ROLE_LABELS[r]}</span>
              </SelectItem>)}</SelectContent>
            </Select>
          </TableCell>
          <TableCell className="whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('he-IL')}</TableCell>
          <TableCell><Switch aria-label={`גישה עבור ${p.full_name}`} checked={!p.is_suspended} disabled={edit.isPending} onCheckedChange={v => edit.mutate({ id: p.id, suspend: !v })} /></TableCell>
          <TableCell><div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`עריכת ${p.full_name || p.email}`} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" aria-label={`מחיקת ${p.full_name || p.email}`} disabled={protectedId(p.id)} onClick={() => setPendingIds([p.id])}><Trash2 className="h-4 w-4" /></Button>
          </div></TableCell>
        </TableRow>;
      })}{!rows.length && <TableRow><TableCell colSpan={selecting ? 9 : 8} className="text-center">לא נמצאו משתמשים</TableCell></TableRow>}</TableBody>
    </Table></div>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !saveDraft.isPending) setDraft(null); }}>
      <DialogContent dir="rtl" className="max-w-lg text-right">
        <DialogHeader className="text-right"><DialogTitle>עריכת משתמש</DialogTitle></DialogHeader>
        {draft && <div className="grid gap-3">
          {([['full_name', 'שם מלא', 'rtl'], ['email', 'אימייל', 'ltr'], ['phone', 'טלפון', 'ltr'], ['city', 'עיר', 'rtl']] as const).map(([k, label, dir]) => (
            <div key={k} className="grid gap-1"><Label htmlFor={`edit-${k}`}>{label}</Label>
              <Input id={`edit-${k}`} dir={dir} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} /></div>
          ))}
          <div className="grid gap-1"><Label>מגדר</Label>
            <Select value={draft.gender || undefined} onValueChange={v => setDraft({ ...draft, gender: v })}>
              <SelectTrigger dir="rtl"><SelectValue placeholder="בחר מגדר" /></SelectTrigger>
              <SelectContent dir="rtl"><SelectItem value="male">גבר</SelectItem><SelectItem value="female">אישה</SelectItem></SelectContent>
            </Select></div>
          <div className="grid gap-1"><Label>הרשאות</Label>
            <div className="flex flex-wrap gap-1">{ROLE_ORDER.map(r => {
              const on = draft.roles.includes(r);
              return <Button key={r} type="button" size="sm" variant={on ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setDraft({ ...draft, roles: on ? draft.roles.filter(x => x !== r) : [...draft.roles, r] })}>{ROLE_LABELS[r]}</Button>;
            })}</div></div>
        </div>}
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" disabled={saveDraft.isPending} onClick={() => setDraft(null)}>ביטול</Button>
          <Button disabled={saveDraft.isPending} onClick={() => draft && saveDraft.mutate(draft)}>{saveDraft.isPending ? 'שומר…' : 'שמירה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pendingIds.length} onOpenChange={open => { if (!open && !deletion.isPending) setPendingIds([]); }}>
      <AlertDialogContent dir="rtl"><AlertDialogHeader className="text-right"><AlertDialogTitle>למחוק {pendingIds.length} משתמשים לצמיתות?</AlertDialogTitle><AlertDialogDescription>החשבונות, הנתונים הפעילים והקבצים שלהם יימחקו ללא אפשרות שחזור.</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-40 overflow-y-auto text-sm">{pendingIds.map(id => <li key={id}>{profiles.data?.find(p => p.id === id)?.full_name || profiles.data?.find(p => p.id === id)?.email}</li>)}</ul>
        <AlertDialogFooter><AlertDialogCancel disabled={deletion.isPending}>ביטול</AlertDialogCancel><Button variant="destructive" disabled={deletion.isPending} onClick={() => deletion.mutate([...pendingIds])}>{deletion.isPending ? 'מוחק…' : 'מחיקה לצמיתות'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
