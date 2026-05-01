import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Trash2, ShieldCheck, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent } from '@/lib/auditLog';

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  email: string | null;
  city: string | null;
  created_at: string | null;
};

const TABLES_FOR_EXPORT = [
  'messages',
  'chat_history',
  'call_records',
  'meetings',
  'booking_tokens',
  'escalation_alerts',
] as const;

export default function PrivacyDashboard() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: leads, isLoading, refetch } = useQuery({
    queryKey: ['privacy-leads', search],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id, full_name, phone_number, email, city, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      const term = search.trim();
      if (term) {
        q = q.or(
          `full_name.ilike.%${term}%,phone_number.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    staleTime: 30_000,
  });

  async function exportLead(lead: Lead) {
    setBusy(true);
    try {
      const exportObj: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        lead,
      };
      for (const t of TABLES_FOR_EXPORT) {
        const { data, error } = await supabase.from(t as any).select('*').eq('lead_id', lead.id);
        if (error) {
          console.warn('export failed for', t, error);
          exportObj[t] = { error: error.message };
        } else {
          exportObj[t] = data ?? [];
        }
      }
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prospect-${lead.id}.json`;
      a.click();
      URL.revokeObjectURL(url);

      await logAuditEvent({
        action: 'privacy_export_lead',
        targetTable: 'leads',
        targetId: lead.id,
        details: { full_name: lead.full_name, phone_last4: lead.phone_number?.slice(-4) },
      });
      toast.success('הייצוא הושלם — הקובץ ירד למחשב');
    } catch (e: any) {
      toast.error('שגיאה בייצוא: ' + (e?.message ?? 'שגיאה לא ידועה'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteLead(lead: Lead) {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('gdpr_delete_lead' as any, {
        _lead_id: lead.id,
      });
      if (error) throw error;
      toast.success('כל ההיסטוריה של הליד נמחקה לצמיתות');
      await logAuditEvent({
        action: 'privacy_delete_lead',
        targetTable: 'leads',
        targetId: lead.id,
        details: { breakdown: data, full_name: lead.full_name },
      });
      setSelected(null);
      refetch();
    } catch (e: any) {
      toast.error('המחיקה נכשלה: ' + (e?.message ?? 'שגיאה לא ידועה'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" />
          פרטיות וציות (GDPR)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          ייצוא נתוני ליד ומחיקה מלאה של היסטוריה — לעמידה בדרישות GDPR ופרטיות בישראל.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">איך הציות עובד אצלנו</CardTitle>
          <CardDescription>שכבת ה-Compliance & Audit פועלת אוטומטית ברקע:</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-start gap-2">
            <Badge variant="outline">Audit</Badge>
            <span>כל פעולה רגישה (שליחה, ייצוא, מחיקה, עדכון בנק האסטרטגיות) נרשמת ביומן בלתי-ניתן-לעריכה.</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline">PII Mask</Badge>
            <span>תעודות זהות, כרטיסי אשראי, IBAN, אימיילים וטלפונים ממוסכים אוטומטית לפני שהם נשלחים ל-AI.</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline">Disclosure</Badge>
            <span>הודעות יוצאות שנוצרו ע"י AI מסומנות בכיתוב "תוכן בסיוע AI" כנדרש בחוק.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            ניהול נתוני לקוח
          </CardTitle>
          <CardDescription>חפש ליד לפי שם, טלפון או אימייל, ואז ייצא או מחק את כל ההיסטוריה שלו.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="search">חיפוש ליד</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="שם, טלפון או אימייל"
                className="pr-9"
              />
            </div>
          </div>

          <ScrollArea className="h-[420px] border rounded-md">
            <div className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
                ))
              ) : (leads ?? []).length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">לא נמצאו לידים</div>
              ) : (
                (leads ?? []).map((lead) => (
                  <div key={lead.id} className="p-3 flex items-center justify-between gap-3 hover:bg-accent/30">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{lead.full_name ?? '(ללא שם)'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lead.phone_number}{lead.email ? ` · ${lead.email}` : ''}{lead.city ? ` · ${lead.city}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => exportLead(lead)}
                      >
                        <Download className="w-3.5 h-3.5 ml-1" /> ייצוא
                      </Button>
                      <AlertDialog open={selected?.id === lead.id} onOpenChange={(o) => setSelected(o ? lead : null)}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" disabled={busy}>
                            <Trash2 className="w-3.5 h-3.5 ml-1" /> מחיקה מלאה
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>מחיקה לצמיתות של {lead.full_name ?? lead.phone_number}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              פעולה זו תמחק <strong>בלתי-הפיכה</strong> את הליד וכל ההיסטוריה הקשורה אליו:
                              הודעות, צ׳אטים, שיחות, פגישות, לינקים לקביעת פגישה והתראות.
                              <br />הפעולה תירשם ביומן הביקורת.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteLead(lead)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              מחק לצמיתות
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
