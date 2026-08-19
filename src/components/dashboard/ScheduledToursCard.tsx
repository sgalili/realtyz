/**
 * ScheduledToursCard
 * ------------------
 * Broker dashboard section listing upcoming property tours booked from public
 * property landing pages, with client details and status management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarClock, Loader2, MapPin, Phone, User } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type Tour = {
  id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  scheduled_at: string;
  property_title: string | null;
  property_address: string | null;
  status: string;
  notes: string | null;
  whatsapp_sent_at: string | null;
};

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישור',
  confirmed: 'מאושר',
  completed: 'בוצע',
  cancelled: 'בוטל',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScheduledToursCard() {
  const qc = useQueryClient();

  const { data: tours = [], isLoading } = useQuery({
    queryKey: ['scheduled-tours'],
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('property_tours')
        .select('id, client_name, client_phone, client_email, scheduled_at, property_title, property_address, status, notes, whatsapp_sent_at')
        .gte('scheduled_at', since)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as Tour[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('property_tours').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-tours'] }),
  });

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" />
          סיורים מתוזמנים
        </CardTitle>
        <CardDescription>סיורים שנקבעו על ידי מתעניינים מדפי הנכס הציבוריים</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : tours.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">אין סיורים מתוזמנים כרגע</p>
        ) : (
          tours.map((t) => (
            <div key={t.id} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  {t.client_name}
                </div>
                <Badge variant="outline" className={STATUS_CLASS[t.status] ?? ''}>
                  {STATUS_HE[t.status] ?? t.status}
                </Badge>
              </div>
              <div className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatWhen(t.scheduled_at)}
                </p>
                {(t.property_title || t.property_address) && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {t.property_title || t.property_address}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  <a href={`tel:${t.client_phone}`} className="hover:underline">{formatPhoneDisplay(t.client_phone)}</a>
                  {t.whatsapp_sent_at ? <span className="text-emerald-600">· אישור נשלח</span> : null}
                </p>
                {t.notes ? <p className="text-[12px]">{t.notes}</p> : null}
              </div>
              <div className="mt-2 flex gap-2">
                {t.status !== 'confirmed' && (
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: t.id, status: 'confirmed' })}>
                    אישור
                  </Button>
                )}
                {t.status !== 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: t.id, status: 'completed' })}>
                    בוצע
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: t.id, status: 'cancelled' })}>
                  ביטול
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduledToursCard;
