import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Mail, Search, SquarePen, Send } from 'lucide-react';

type Row = {
  id: string;
  created_at: string;
  from_email: string;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  status: string;
  provider?: string;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function Mailbox({ embedded = false }: { embedded?: boolean } = {}) {
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) return toast.error('כתובת מייל לא תקינה');
    if (!text.trim()) return toast.error('יש לכתוב תוכן');
    setSending(true);
    const { data, error } = await supabase.functions.invoke('resend-email-sender', {
      body: { recipient_email: to.trim(), subject: subject.trim() || '(ללא נושא)', body_text: text },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error ?? error?.message;
      try { msg = JSON.parse(await (error as any).context.text()).error ?? msg; } catch { /* */ }
      return toast.error(msg || 'השליחה נכשלה');
    }
    toast.success('המייל נשלח');
    setCompose(false); setTo(''); setSubject(''); setText('');
    qc.invalidateQueries({ queryKey: ['mailbox-outbound'] });
  };
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const { data: mailbox } = useQuery({
    queryKey: ['workspace-mailbox'],
    queryFn: async () => ((await supabase.rpc('get_workspace_mailbox' as never)).data ?? {}) as any,
  });

  const { data: inbound = [], isLoading: inLoading } = useQuery({
    queryKey: ['mailbox-inbound'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbound_emails_log' as any)
        .select('id, created_at, from_email, to_email, subject, body_text, status')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const { data: outbound = [], isLoading: outLoading } = useQuery({
    queryKey: ['mailbox-outbound'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_emails_log' as any)
        .select('id, created_at, from_email, to_email, subject, body_text, status, provider')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const filter = (rows: Row[]) => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.from_email, r.to_email, r.subject, r.body_text].some((v) => (v ?? '').toLowerCase().includes(t)),
    );
  };

  const List = ({ rows, loading, kind }: { rows: Row[]; loading: boolean; kind: 'in' | 'out' }) => {
    if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">טוען…</p>;
    const list = filter(rows);
    if (list.length === 0)
      return <p className="text-sm text-muted-foreground py-8 text-center">{kind === 'in' ? 'אין מיילים נכנסים' : 'אין מיילים יוצאים'}</p>;
    return (
      <div className="space-y-2">
        {list.map((r) => (
          <Card key={r.id} className="p-3 cursor-pointer hover:bg-muted/40" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{r.subject || '(ללא נושא)'}</div>
                <div className="text-xs text-muted-foreground truncate" dir="ltr">
                  {kind === 'in' ? `${r.from_email} → ${r.to_email ?? ''}` : `${r.from_email} → ${r.to_email ?? ''}`}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(r.created_at)}</span>
                {kind === 'in' ? (
                  <Badge variant={r.status === 'matched' ? 'default' : 'secondary'} className="text-[10px]">
                    {r.status === 'matched' ? 'איש קשר' : 'לא מזוהה'}
                  </Badge>
                ) : (
                  <Badge variant={r.status === 'sent' ? 'default' : 'destructive'} className="text-[10px]">
                    {r.status === 'sent' ? (r.provider === 'gmail' ? 'נשלח · Gmail' : 'נשלח') : 'נכשל'}
                  </Badge>
                )}
              </div>
            </div>
            {open === r.id && (
              <p className="mt-3 text-sm whitespace-pre-wrap border-t pt-3">{r.body_text || '(ללא תוכן)'}</p>
            )}
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div dir="rtl" className={embedded ? 'space-y-4' : 'max-w-4xl mx-auto p-4 space-y-4'}>
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary shrink-0" />
        {mailbox?.address ? (
          <span dir="ltr" className="font-mono text-sm font-semibold truncate">{mailbox.address}</span>
        ) : (
          <span className="text-sm text-muted-foreground">טרם הוגדרה כתובת @realtyz.co.il למרחב העבודה</span>
        )}
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="מייל חדש" title="מייל חדש" onClick={() => setCompose(true)}>
          <SquarePen className="h-4 w-4" />
        </Button>
      </div>
      {isAdmin && <p className="text-xs text-muted-foreground">כמנהל מערכת מוצגים גם מיילים ל-info@realtyz.co.il ולכל המרחבים.</p>}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מייל" className="pr-9" />
      </div>
      <Dialog open={compose} onOpenChange={setCompose}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>מייל חדש</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input dir="ltr" type="email" placeholder="נמען" value={to} onChange={(e) => setTo(e.target.value)} />
            <Input placeholder="נושא" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea rows={8} placeholder="תוכן המייל" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={send} disabled={sending} className="gap-2"><Send className="h-4 w-4" />{sending ? 'שולח…' : 'שליחה'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">דואר נכנס ({inbound.length})</TabsTrigger>
          <TabsTrigger value="out">דואר יוצא ({outbound.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="in"><List rows={inbound} loading={inLoading} kind="in" /></TabsContent>
        <TabsContent value="out"><List rows={outbound} loading={outLoading} kind="out" /></TabsContent>
      </Tabs>
    </div>
  );
}
