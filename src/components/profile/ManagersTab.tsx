import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, MessageSquare, Megaphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type ManagerRow = {
  id: string;
  user_id: string;
  phone_number: string;
  label: string | null;
};

const TIERS = [
  { value: 'full', label: 'ניהול מלא' },
  { value: 'edit', label: 'עריכה' },
  { value: 'view', label: 'צפייה בלבד' },
];

const initialsOf = (name: string) => {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
};

/** Render any whitelist phone variant as a single Israeli 05X-XXXXXXX string. */
function displayPhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  let national = digits;
  if (national.startsWith('972')) national = '0' + national.slice(3);
  if (!national.startsWith('0') && national.length === 9) national = '0' + national;
  if (national.length !== 10) return ''; // hide malformed
  return `${national.slice(0, 3)}-${national.slice(3)}`;
}

function pickPrimaryPhone(rows: { phone_number: string }[]): string {
  for (const r of rows) {
    const pretty = displayPhone(r.phone_number);
    if (pretty) return pretty;
  }
  return '';
}

export function ManagersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState('full');
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<Record<string, string>>({});

  const { data: managers = [], isLoading } = useQuery({
    queryKey: ['kb_whitelist_managers', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ManagerRow[]> => {
      const { data, error } = await supabase
        .from('kb_whitelist')
        .select('id,user_id,phone_number,label')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = Object.values(
    managers.reduce<Record<string, ManagerRow[]>>((acc, m) => {
      const key = (m.label || m.phone_number).replace(/\s*\(pending invite\)\s*/i, '').trim() || m.phone_number;
      (acc[key] ||= []).push(m);
      return acc;
    }, {}),
  );

  const handleAdd = async () => {
    if (!user?.id) return;
    if (!name.trim() || !phone.trim()) {
      toast.error('יש למלא שם וטלפון');
      return;
    }
    setSaving(true);
    const raw = phone.replace(/[^\d+]/g, '');
    let national = raw.replace(/^\+/, '');
    if (national.startsWith('972')) national = '0' + national.slice(3);
    if (!national.startsWith('0')) national = '0' + national;
    const intl = '972' + national.slice(1);
    const variants = Array.from(new Set([national, intl, '+' + intl]));
    const { error } = await supabase.from('kb_whitelist').upsert(
      variants.map((p) => ({
        user_id: user.id,
        phone_number: p,
        label: name.trim(),
      })),
      { onConflict: 'user_id,phone_number' },
    );
    setSaving(false);
    if (error) {
      toast.error('שמירה נכשלה: ' + error.message);
      return;
    }
    toast.success('המנהל נוסף');
    setName(''); setPhone(''); setTier('full'); setOpen(false);
    qc.invalidateQueries({ queryKey: ['kb_whitelist_managers'] });
  };

  const handleDelete = async (rows: ManagerRow[]) => {
    if (!confirm('להסיר את גישת המנהל?')) return;
    const ids = rows.map((r) => r.id);
    const { error } = await supabase.from('kb_whitelist').delete().in('id', ids);
    if (error) { toast.error('שגיאה במחיקה'); return; }
    toast.success('המנהל הוסר');
    qc.invalidateQueries({ queryKey: ['kb_whitelist_managers'] });
  };

  const handleMessage = (rows: ManagerRow[]) => {
    const phone = rows.find((r) => /^\+?972\d/.test(r.phone_number))?.phone_number
      ?? rows[0].phone_number;
    const wa = phone.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${wa}`, '_blank');
  };

  const handleBroadcast = () => {
    if (!grouped.length) { toast.error('אין מנהלים ברשימה'); return; }
    const numbers = grouped
      .map((g) => g.find((r) => /^\+?972\d/.test(r.phone_number))?.phone_number ?? g[0].phone_number)
      .map((p) => p.replace(/[^\d]/g, ''));
    toast.success(`הודעה קבוצתית תישלח ל-${numbers.length} מנהלים`);
    window.open(`https://wa.me/?text=${encodeURIComponent('הודעה למנהלי החשבון:')}`, '_blank');
  };

  return (
    <Card dir="rtl">
      <CardContent className="space-y-4 p-4 sm:p-6 text-right">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-right">מנהלים מורשים בחשבון</h2>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="הוספת מנהל"
            className="h-10 w-10 border-dashed"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={handleBroadcast}
            className="gap-2 bg-[hsl(220_70%_25%)] hover:bg-[hsl(220_70%_20%)] text-white"
          >
            <Megaphone className="h-4 w-4" />
            הודעה קבוצתית
          </Button>
        </div>

        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground text-right">טוען...</p>}
          {!isLoading && grouped.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
              אין מנהלים מורשים. לחצו על + להוספה.
            </div>
          )}
          {grouped.map((rows) => {
            const primary = rows[0];
            const displayName = (primary.label || primary.phone_number)
              .replace(/\s*\(pending invite\)\s*/i, '')
              .trim();
            const isPending = (primary.label || '').toLowerCase().includes('pending');
            const tierVal = tiers[primary.id] ?? 'full';
            return (
              <div
                key={primary.id}
                dir="rtl"
                className="flex w-full items-center gap-2 overflow-hidden rounded-xl border bg-card px-3 py-3 sm:px-4 text-right"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(220_70%_25%)] text-sm font-semibold text-white">
                  {initialsOf(displayName)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col text-right">
                  <span className="truncate text-sm font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground" dir="ltr">
                    {pickPrimaryPhone(rows)}
                  </span>
                  {isPending && (
                    <span className="truncate text-[10px] text-amber-600">ממתין לאישור הזמנה</span>
                  )}
                </div>
                <Select
                  value={tierVal}
                  onValueChange={(v) => setTiers((s) => ({ ...s, [primary.id]: v }))}
                >
                  <SelectTrigger className="h-9 w-[96px] shrink-0 text-xs" dir="rtl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {TIERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMessage(rows)}
                    aria-label="שלח הודעה"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(rows)}
                    aria-label="הסר מנהל"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader>
            <DialogTitle className="text-right">הוספת מנהל חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>שם מלא</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label>טלפון (WhatsApp)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05X-XXXXXXX" />
            </div>
            <div className="space-y-1">
              <Label>הרשאה</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {TIERS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[hsl(220_70%_25%)] hover:bg-[hsl(220_70%_20%)] text-white">
              {saving ? 'שומר...' : 'הוסף מנהל'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
