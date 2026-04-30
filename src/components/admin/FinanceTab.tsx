import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Wallet, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

export function FinanceTab() {
  const qc = useQueryClient();
  const [targetUser, setTargetUser] = useState<{ id: string; email: string } | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users-finance'],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('created_at', { ascending: false });
      if (!profiles) return [];
      // fetch balances in parallel
      const withBalance = await Promise.all(
        profiles.map(async (p) => {
          const { data } = await supabase.rpc('get_user_balance', { _user_id: p.id });
          const b = data?.[0] ?? { total_topups: 0, total_spend: 0, mtd_spend: 0, balance: 0 };
          return { ...p, ...b };
        })
      );
      return withBalance;
    },
    refetchInterval: 60_000,
  });

  const adjust = useMutation({
    mutationFn: async () => {
      const amt = Number(adjAmount);
      if (!amt || !targetUser) throw new Error('סכום או משתמש חסרים');
      const { error } = await supabase.from('balance_adjustments').insert({
        user_id: targetUser.id,
        amount: amt,
        reason: adjReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-finance'] });
      toast.success('התאמה בוצעה');
      setTargetUser(null); setAdjAmount(''); setAdjReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> יתרות ושימוש לכל משתמש
          </CardTitle>
          <CardDescription>יתרה חיה = הטענות − הוצאה. MTD = הוצאה מחודש נוכחי</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>משתמש</TableHead>
                  <TableHead>יתרה</TableHead>
                  <TableHead>הוצאה MTD</TableHead>
                  <TableHead>סה״כ הוצאה</TableHead>
                  <TableHead>סה״כ הטענות</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{u.full_name || '-'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                    </TableCell>
                    <TableCell className={`tabular-nums font-bold whitespace-nowrap ${Number(u.balance) < 0 ? 'text-red-600' : 'text-primary'}`}>
                      ₪{Math.round(Number(u.balance)).toLocaleString()}
                    </TableCell>
                    <TableCell className="tabular-nums text-amber-600 whitespace-nowrap">
                      ₪{Math.round(Number(u.mtd_spend)).toLocaleString()}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      ₪{Math.round(Number(u.total_spend)).toLocaleString()}
                    </TableCell>
                    <TableCell className="tabular-nums text-emerald-600 whitespace-nowrap">
                      ₪{Math.round(Number(u.total_topups)).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setTargetUser({ id: u.id, email: u.email }); setAdjAmount(''); setAdjReason(''); }}
                      >
                        התאמה ידנית
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">אין משתמשים</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!targetUser} onOpenChange={(v) => !v && setTargetUser(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>התאמת יתרה ידנית</DialogTitle>
            <DialogDescription>
              משתמש: <span className="font-mono">{targetUser?.email}</span>. השתמש בסכום חיובי להטענה, שלילי לחיוב.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>סכום (₪)</Label>
              <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="+500 או -100" />
            </div>
            <div>
              <Label>סיבה</Label>
              <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} rows={3} placeholder="לדוגמה: זיכוי תקלה, הטענת פתיחה..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setTargetUser(null)}>ביטול</Button>
              <Button onClick={() => adjust.mutate()} disabled={adjust.isPending}>
                {Number(adjAmount) >= 0 ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                שמור התאמה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
