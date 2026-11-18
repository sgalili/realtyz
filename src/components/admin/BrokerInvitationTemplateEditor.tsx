import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Loader2, Pencil, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Gender = 'male' | 'female';
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-broker-invitation', { body });
  if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה'); }
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה');
  return data as T;
}
const STATUS: Record<string, string> = { NOT_REGISTERED: 'טרם הוגש ל-Meta', PENDING: 'ממתין לאישור Meta', APPROVED: 'מאושר', REJECTED: 'נדחה ע״י Meta', PAUSED: 'מושהה', DISABLED: 'לא פעיל' };

function GenderEditor({ gender, initial }: { gender: Gender; initial: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const status = useQuery({ queryKey: ['broker-template-status', gender], queryFn: () => invoke<{ status: string }>({ action: 'status', gender }) });
  const submit = useMutation({
    mutationFn: () => invoke<{ status: string }>({ action: 'save_text', gender, text }),
    onSuccess: d => { toast.success(d.status === 'APPROVED' ? 'הנוסח נשמר ומאושר' : 'הנוסח נשמר והוגש לאישור Meta'); void qc.invalidateQueries({ queryKey: ['broker-template-texts'] }); void qc.invalidateQueries({ queryKey: ['broker-template-status', gender] }); void qc.invalidateQueries({ queryKey: ['official-broker-template'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <div className="space-y-3">
    <Textarea aria-label={gender === 'female' ? 'נוסח לנשים' : 'נוסח לגברים'} className="min-h-[220px] text-base" value={text} onChange={e => setText(e.target.value)} />
    <p className="text-sm text-muted-foreground">חובה לשמור את {'{brokerName}'} פעם אחת. כל שינוי יוצר תבנית חדשה שדורשת אישור Meta לפני שליחה.</p>
    <div className="flex items-center justify-between gap-2">
      <span role="status" className="text-sm text-muted-foreground">{status.isFetching ? 'בודק…' : STATUS[status.data?.status ?? ''] ?? status.data?.status ?? ''}</span>
      <Button disabled={submit.isPending || text.trim() === ''} onClick={() => submit.mutate()}>{submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}שמירה והגשה ל-Meta</Button>
    </div>
  </div>;
}

/** Super Admin: edit the separate male/female WhatsApp invitation templates and submit them to Meta. */
export function BrokerInvitationTemplateEditor() {
  const [open, setOpen] = useState(false);
  const texts = useQuery({ queryKey: ['broker-template-texts'], enabled: open, queryFn: () => invoke<{ male: string; female: string }>({ action: 'texts' }) });
  return <>
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="עריכת תבנית WhatsApp" title="עריכת תבנית WhatsApp" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>תבנית הזמנה ב-WhatsApp</DialogTitle><DialogDescription>נוסח נפרד לגברים ולנשים. הנמען מקבל את הנוסח לפי המגדר השמור בפרופיל.</DialogDescription></DialogHeader>
        {texts.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : texts.isError ? <p role="alert" className="text-destructive">{(texts.error as Error).message}</p> :
          <Tabs defaultValue="male" dir="rtl"><TabsList><TabsTrigger value="male">לגברים</TabsTrigger><TabsTrigger value="female">לנשים</TabsTrigger></TabsList>
            <TabsContent value="male"><GenderEditor gender="male" initial={texts.data?.male ?? ''} /></TabsContent>
            <TabsContent value="female"><GenderEditor gender="female" initial={texts.data?.female ?? ''} /></TabsContent>
          </Tabs>}
      </DialogContent>
    </Dialog>
  </>;
}
