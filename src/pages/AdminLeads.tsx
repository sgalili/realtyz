import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { sendToN8n } from '@/lib/n8nService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle, Phone, Mail, Clock, User, Tag,
  CheckCircle2, Loader2, Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { formatPhoneDisplay } from '@/lib/formatPhone';

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: 'חדש', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  contacted: { label: 'נוצר קשר', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  qualified: { label: 'מתאים', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  closed: { label: 'סגור', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
};

const AdminLeads = () => {
  const queryClient = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendWhatsApp = useMutation({
    mutationFn: async (lead: { id: string; full_name: string; phone_number: string }) => {
      // Send via the automation layer
      const result = await sendToN8n('lead_whatsapp', {
        lead_id: lead.id,
        phone: lead.phone_number,
        name: lead.full_name,
        message: `שלום ${lead.full_name}, תודה שיצרת קשר! נשמח לדבר איתך. צוות Kalpiz AI 🚀`,
      });

      if (!result.ok && !result.skipped) throw new Error('Failed to send');

      // Mark as sent
      await supabase.from('leads').update({ wa_sent: true, status: 'contacted' }).eq('id', lead.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      toast.success('הודעת WhatsApp נשלחה בהצלחה!');
    },
    onError: () => {
      toast.error('שליחת ההודעה נכשלה - בדוק חיבור אוטומציה');
    },
  });

  const newCount = leads?.filter((l) => l.status === 'new').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">פניות נכנסות (Leads)</h1>
        <p className="text-muted-foreground text-sm">ניהול לידים מטופס יצירת הקשר</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">סה״כ לידים</p>
              <p className="text-2xl font-bold">{leads?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Tag className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">חדשים (ממתינים)</p>
              <p className="text-2xl font-bold">{newCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">נשלח WA</p>
              <p className="text-2xl font-bold">{leads?.filter((l) => l.wa_sent).length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads list */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">רשימת פניות</CardTitle>
          <CardDescription className="text-xs">לחץ על "שלח WhatsApp" כדי לשלוח הודעה אוטומטית דרך חיבורי המערכת</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leads?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">אין פניות עדיין</p>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {leads?.map((lead) => {
                  const st = statusConfig[lead.status || 'new'] || statusConfig.new;
                  return (
                    <div key={lead.id} className="p-4 rounded-xl border border-border/50 hover:border-border/80 transition-colors space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                            <span className="text-sm font-medium text-accent-foreground">
                              {(lead.full_name || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">{lead.full_name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span dir="ltr">{formatPhoneDisplay(lead.phone_number)}</span>
                              </span>
                              {lead.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {lead.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                          {lead.tag && (
                            <Badge variant="secondary" className="text-[10px]">
                              <Tag className="h-2.5 w-2.5 ml-1" />
                              {lead.tag}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {lead.message && (
                        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 border border-border/30">
                          {lead.message}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yy HH:mm') : ''}
                        </span>
                        {lead.wa_sent ? (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-emerald-300">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            WA נשלח
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-500/10"
                            onClick={() => sendWhatsApp.mutate({ id: lead.id, full_name: lead.full_name, phone_number: lead.phone_number })}
                            disabled={sendWhatsApp.isPending}
                          >
                            {sendWhatsApp.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            שלח WhatsApp
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLeads;
