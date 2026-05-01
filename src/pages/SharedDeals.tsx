import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Handshake, Send, Inbox, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Status = "pending" | "in_negotiation" | "closed_won" | "closed_lost" | "cancelled";

const STATUS_LABEL: Record<Status, string> = {
  pending: "ממתין",
  in_negotiation: "במו״מ",
  closed_won: "נסגר בהצלחה",
  closed_lost: "לא נסגר",
  cancelled: "בוטל",
};

const STATUS_VARIANT: Record<Status, string> = {
  pending: "bg-muted text-foreground",
  in_negotiation: "bg-primary/15 text-primary",
  closed_won: "bg-success/15 text-success",
  closed_lost: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

interface ReferralRow {
  id: string;
  sender_user_id: string;
  recipient_user_id: string | null;
  partner_name: string;
  partner_email: string | null;
  partner_phone: string | null;
  subject_kind: "lead" | "listing" | "other";
  subject_label: string;
  status: Status;
  channel: "whatsapp" | "email" | "manual";
  commission_split_pct: number | null;
  delivery_status: string;
  delivery_meta: { wa_link?: string | null; mailto_link?: string | null };
  message_body: string | null;
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  direction: "outbound" | "inbound";
}

export default function SharedDeals() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"sent" | "received">("sent");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");

  const { data: meId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["broker-referrals", tab, meId],
    enabled: !!meId,
    queryFn: async () => {
      let q = supabase.from("broker_referrals").select("*");
      if (tab === "sent") q = q.eq("sender_user_id", meId!);
      else q = q.eq("recipient_user_id", meId!);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as ReferralRow[];
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !r.partner_name.toLowerCase().includes(s) &&
          !r.subject_label.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      pending: 0,
      in_negotiation: 0,
      closed_won: 0,
      closed_lost: 0,
      cancelled: 0,
    };
    rows.forEach((r) => {
      c[r.status]++;
    });
    return c;
  }, [rows]);

  async function updateStatus(id: string, next: Status) {
    const { error } = await supabase
      .from("broker_referrals")
      .update({ status: next })
      .eq("id", id);
    if (error) {
      toast.error("עדכון נכשל: " + error.message);
      return;
    }
    toast.success("הסטטוס עודכן");
    qc.invalidateQueries({ queryKey: ["broker-referrals"] });
  }

  return (
    <div dir="rtl" className="space-y-4 p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            עסקאות משותפות
          </h1>
          <p className="text-sm text-muted-foreground">
            ניהול הפניות מקצועיות בין מתווכים – שליחה, קבלה ומעקב סטטוס.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <Card key={s} className="p-3">
            <div className="text-[11px] text-muted-foreground">{STATUS_LABEL[s]}</div>
            <div className="text-2xl font-bold">{counts[s]}</div>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "sent" | "received")}>
        <TabsList>
          <TabsTrigger value="sent" className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> שלחתי
          </TabsTrigger>
          <TabsTrigger value="received" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> קיבלתי
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם שותף או נושא"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value={tab} className="mt-3">
          {isLoading ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">טוען...</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {tab === "sent"
                ? "עדיין לא שלחת הפניות. השתמש בכפתור 'הפניה' שמופיע על כל מתעניין או נכס."
                : "אין הפניות נכנסות. כאשר מתווך אחר מהרשת ישלח אליך הפניה היא תופיע כאן."}
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <Card key={r.id} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.partner_name}</span>
                        <Badge className={STATUS_VARIANT[r.status]}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.channel === "whatsapp"
                            ? "WhatsApp"
                            : r.channel === "email"
                              ? "אימייל"
                              : "ידני"}
                        </Badge>
                        {r.commission_split_pct != null && (
                          <Badge variant="outline" className="text-[10px]">
                            עמלה: {r.commission_split_pct}%
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-foreground/90">{r.subject_label}</div>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                        <span>נוצר: {format(new Date(r.created_at), "dd/MM/yy HH:mm")}</span>
                        {r.closed_at && (
                          <span>נסגר: {format(new Date(r.closed_at), "dd/MM/yy")}</span>
                        )}
                        {r.partner_email && <span dir="ltr">{r.partner_email}</span>}
                        {r.partner_phone && <span dir="ltr">{r.partner_phone}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {tab === "sent" && r.delivery_meta?.wa_link && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="gap-1"
                        >
                          <a href={r.delivery_meta.wa_link} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" /> פתח WhatsApp
                          </a>
                        </Button>
                      )}
                      {tab === "sent" && r.delivery_meta?.mailto_link && (
                        <Button size="sm" variant="outline" asChild className="gap-1">
                          <a href={r.delivery_meta.mailto_link}>
                            <ExternalLink className="h-3.5 w-3.5" /> פתח אימייל
                          </a>
                        </Button>
                      )}
                      <Select
                        value={r.status}
                        onValueChange={(v) => updateStatus(r.id, v as Status)}
                      >
                        <SelectTrigger className="h-8 w-[150px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {r.message_body && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer">
                        תוכן ההודעה
                      </summary>
                      <pre className="text-xs whitespace-pre-wrap mt-1 bg-muted/40 p-2 rounded">
                        {r.message_body}
                      </pre>
                    </details>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
