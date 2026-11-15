import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { ROTATING_MESSAGES_QUERY_KEY, useAllRotatingMessages } from '@/hooks/useRotatingMessages';
import {
  ROTATING_MESSAGE_AUDIENCES,
  ROTATING_MESSAGE_AUDIENCE_LABELS,
  cleanRotatingMessageText,
  validRotatingMessageText,
  type RotatingMessage,
  type RotatingMessageAudience,
} from '@/lib/rotatingMessages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const db = supabase as any;

export function RotatingMessagesManager() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useUserRole();
  const { data: messages = [], isLoading, error } = useAllRotatingMessages(isSuperAdmin);
  const [newAudience, setNewAudience] = useState<RotatingMessageAudience>('guest');
  const [newText, setNewText] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<RotatingMessage | null>(null);

  const grouped = useMemo(() => Object.fromEntries(
    ROTATING_MESSAGE_AUDIENCES.map((audience) => [
      audience,
      messages.filter((message) => message.role_key === audience),
    ]),
  ) as Record<RotatingMessageAudience, RotatingMessage[]>, [messages]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ROTATING_MESSAGES_QUERY_KEY });

  const addMessage = useMutation({
    mutationFn: async () => {
      const messageText = cleanRotatingMessageText(newText);
      if (!validRotatingMessageText(messageText)) throw new Error('יש להזין מסר של עד 240 תווים');
      const nextOrder = Math.max(0, ...grouped[newAudience].map((message) => message.sort_order)) + 10;
      const { error: insertError } = await db.from('rotating_messages').insert({
        role_key: newAudience,
        message_text: messageText,
        sort_order: nextOrder,
        is_active: true,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setNewText('');
      toast.success('המסר נוסף ויופיע בלוח');
      void refresh();
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'הוספת המסר נכשלה'),
  });

  const saveMessage = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const messageText = cleanRotatingMessageText(text);
      if (!validRotatingMessageText(messageText)) throw new Error('יש להזין מסר של עד 240 תווים');
      const { error: updateError } = await db
        .from('rotating_messages')
        .update({ message_text: messageText })
        .eq('id', id);
      if (updateError) throw updateError;
      return { id, messageText };
    },
    onSuccess: ({ id, messageText }) => {
      setEdits((current) => ({ ...current, [id]: messageText }));
      toast.success('המסר עודכן בכל המערכת');
      void refresh();
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'עדכון המסר נכשל'),
  });

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error: deleteError } = await db.from('rotating_messages').delete().eq('id', id);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success('המסר נמחק');
      void refresh();
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'מחיקת המסר נכשלה'),
  });

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareText className="h-5 w-5 text-primary" /> ניהול מסרים מתחלפים
          </CardTitle>
          <CardDescription>המסרים מותאמים לסוג המשתמש ומתעדכנים בלוח מיד לאחר שמירה.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <Select value={newAudience} onValueChange={(value) => setNewAudience(value as RotatingMessageAudience)}>
              <SelectTrigger aria-label="קהל למסר חדש"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROTATING_MESSAGE_AUDIENCES.map((audience) => (
                  <SelectItem key={audience} value={audience}>{ROTATING_MESSAGE_AUDIENCE_LABELS[audience]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              aria-label="תוכן המסר החדש"
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              maxLength={240}
              rows={2}
              placeholder="כתבו מסר קצר לתצוגה בלוח"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{newText.length}/240 תווים</span>
            <Button onClick={() => addMessage.mutate()} disabled={!validRotatingMessageText(newText) || addMessage.isPending}>
              <Plus className="h-4 w-4" /> {addMessage.isPending ? 'מוסיף…' : 'הוספת מסר'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">טעינת המסרים נכשלה. נסו לרענן את העמוד.</p>}
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">טוען מסרים…</p>}

      {!isLoading && !error && <div className="grid items-start gap-4 xl:grid-cols-2">
        {ROTATING_MESSAGE_AUDIENCES.map((audience) => (
          <Card key={audience}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ROTATING_MESSAGE_AUDIENCE_LABELS[audience]}</CardTitle>
              <CardDescription>{grouped[audience].length} מסרים פעילים</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {grouped[audience].map((message) => {
                const value = edits[message.id] ?? message.message_text;
                const changed = cleanRotatingMessageText(value) !== message.message_text;
                return (
                  <div key={message.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                    <Input
                      aria-label={`עריכת מסר עבור ${ROTATING_MESSAGE_AUDIENCE_LABELS[audience]}`}
                      value={value}
                      onChange={(event) => setEdits((current) => ({ ...current, [message.id]: event.target.value }))}
                      maxLength={240}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="שמירת מסר"
                      title="שמירת מסר"
                      disabled={!changed || !validRotatingMessageText(value) || saveMessage.isPending}
                      onClick={() => saveMessage.mutate({ id: message.id, text: value })}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="מחיקת מסר"
                      title="מחיקת מסר"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(message)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {grouped[audience].length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">אין מסרים לקהל זה</p>}
            </CardContent>
          </Card>
        ))}
      </div>}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleteMessage.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>למחוק את המסר?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.message_text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMessage.isPending}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMessage.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMessage.mutate(deleteTarget.id);
              }}
            >
              {deleteMessage.isPending ? 'מוחק…' : 'מחיקה'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default RotatingMessagesManager;
