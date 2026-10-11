import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { formatPhoneAsTyped, formatPhoneDisplay, normalizePhoneForStorage } from '@/lib/formatPhone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

type Developer = {
  id: string;
  workspace_owner_id: string;
  company_name: string;
  phone: string | null;
  source_url: string | null;
  first_project_name: string | null;
  first_project_units: number | null;
  created_at: string;
};

type DeveloperForm = {
  company_name: string;
  phone: string;
  source_url: string;
  first_project_name: string;
  first_project_units: string;
};

const EMPTY_FORM: DeveloperForm = {
  company_name: '',
  phone: '',
  source_url: '',
  first_project_name: '',
  first_project_units: '',
};

export default function Developers() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Developer | null>(null);
  const [form, setForm] = useState<DeveloperForm>(EMPTY_FORM);
  const [search, setSearch] = useState('');

  const { data: developers = [], isLoading } = useQuery({
    queryKey: ['developers', activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('developers')
        .select('*')
        .eq('workspace_owner_id', activeWorkspaceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Developer[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return developers;
    return developers.filter((d) =>
      [d.company_name, d.first_project_name, d.phone]
        .filter(Boolean)
        .some((v) => String(v).includes(q)),
    );
  }, [developers, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error('no-workspace');
      const units = form.first_project_units.trim()
        ? Math.max(0, parseInt(form.first_project_units.trim(), 10) || 0)
        : null;
      const payload = {
        company_name: form.company_name.trim(),
        phone: form.phone.trim() ? normalizePhoneForStorage(form.phone) : null,
        source_url: form.source_url.trim() || null,
        first_project_name: form.first_project_name.trim() || null,
        first_project_units: units,
      };
      if (editing) {
        const { error } = await supabase
          .from('developers')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('developers')
          .insert({ ...payload, workspace_owner_id: activeWorkspaceId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'היזם עודכן בהצלחה' : 'היזם נוסף בהצלחה');
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ['developers', activeWorkspaceId] });
    },
    onError: () => toast.error('שמירת היזם נכשלה'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('developers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('היזם נמחק');
      queryClient.invalidateQueries({ queryKey: ['developers', activeWorkspaceId] });
    },
    onError: () => toast.error('מחיקת היזם נכשלה'),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: Developer) => {
    setEditing(d);
    setForm({
      company_name: d.company_name,
      phone: d.phone ? formatPhoneDisplay(d.phone).replace('-', '') : '',
      source_url: d.source_url ?? '',
      first_project_name: d.first_project_name ?? '',
      first_project_units: d.first_project_units != null ? String(d.first_project_units) : '',
    });
    setDialogOpen(true);
  };

  const canSave = form.company_name.trim().length > 0 && !saveMutation.isPending;

  return (
    <div dir="rtl" className="container mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold text-slate-900">יזמים וקבלנים</h1>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          הוספת יזם
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש חופשי"
        className="max-w-sm"
      />

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">שם החברה</TableHead>
              <TableHead className="text-right">שם הפרויקט הראשון</TableHead>
              <TableHead className="text-right">סך יחידות דיור</TableHead>
              <TableHead className="text-right">טלפון</TableHead>
              <TableHead className="text-right">קישור ליד2</TableHead>
              <TableHead className="text-right w-[90px]">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  טוען…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  אין יזמים להצגה. לחצו על "הוספת יזם" כדי להתחיל.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.company_name}</TableCell>
                  <TableCell>{d.first_project_name || '—'}</TableCell>
                  <TableCell>
                    {d.first_project_units != null ? d.first_project_units.toLocaleString('he-IL') : '—'}
                  </TableCell>
                  <TableCell dir="ltr" className="text-right">
                    {d.phone ? formatPhoneDisplay(d.phone) : '—'}
                  </TableCell>
                  <TableCell>
                    {d.source_url ? (
                      <a
                        href={d.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        צפייה
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)} aria-label="עריכה">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(d.id)}
                        aria-label="מחיקה"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'עריכת יזם' : 'הוספת יזם'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dev-company">שם החברה *</Label>
              <Input
                id="dev-company"
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="למשל: אזורים בנייה והשקעות"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-phone">מספר טלפון</Label>
              <Input
                id="dev-phone"
                dir="ltr"
                className="text-right"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))}
                placeholder="05X-XXXXXXX"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-url">קישור ליד2</Label>
              <Input
                id="dev-url"
                dir="ltr"
                className="text-right"
                value={form.source_url}
                onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                placeholder="https://www.yad2.co.il/…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-project">שם הפרויקט הראשון</Label>
              <Input
                id="dev-project"
                value={form.first_project_name}
                onChange={(e) => setForm((f) => ({ ...f, first_project_name: e.target.value }))}
                placeholder="למשל: נוף הגליל"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dev-units">סך יחידות דיור בפרויקט</Label>
              <Input
                id="dev-units"
                dir="ltr"
                className="text-right"
                inputMode="numeric"
                value={form.first_project_units}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_project_units: e.target.value.replace(/\D/g, '') }))
                }
                placeholder="למשל: 120"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>
              {editing ? 'שמירת שינויים' : 'הוספה'}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
