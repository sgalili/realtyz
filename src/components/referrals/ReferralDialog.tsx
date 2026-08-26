import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Send, ExternalLink, Mail } from "lucide-react";
import { formatPhoneDisplay } from '@/lib/formatPhone';

export type ReferralSubject =
  | { kind: "lead"; id: string; label: string }
  | { kind: "listing"; id: string; label: string }
  | { kind: "other"; label: string };

interface PartnerBroker {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  agency: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: ReferralSubject;
}

const DEFAULT_TEMPLATE = (subjectLabel: string) =>
  `שלום, יש לי הפניה מקצועית עבורך:\n\n${subjectLabel}\n\nאשמח לתאם שיחה קצרה ולסכם את העמלות. תודה!`;

export function ReferralDialog({ open, onOpenChange, subject }: Props) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [partnerId, setPartnerId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAgency, setNewAgency] = useState("");
  const [savePartner, setSavePartner] = useState(true);
  const [channel, setChannel] = useState<"whatsapp" | "email" | "manual">("whatsapp");
  const [commission, setCommission] = useState<string>("");
  const [body, setBody] = useState(DEFAULT_TEMPLATE(subject.label));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setBody(DEFAULT_TEMPLATE(subject.label));
  }, [open, subject.label]);

  const { data: partners = [], refetch } = useQuery({
    queryKey: ["partner-brokers"],
    queryFn: async (): Promise<PartnerBroker[]> => {
      const { data, error } = await supabase
        .from("partner_brokers")
        .select("id,full_name,email,phone,agency")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === partnerId) ?? null,
    [partners, partnerId],
  );

  async function handleSubmit() {
    setSubmitting(true);
    try {
      let usePartnerId = partnerId || null;
      let name = selectedPartner?.full_name ?? newName.trim();
      const email = selectedPartner?.email ?? (newEmail.trim() || null);
      const phone = selectedPartner?.phone ?? (newPhone.trim() || null);

      if (tab === "new") {
        if (!newName.trim()) {
          toast.error("נא להזין שם המתווך השותף");
          setSubmitting(false);
          return;
        }
        if (!email && !phone) {
          toast.error("נא להזין אימייל או טלפון של השותף");
          setSubmitting(false);
          return;
        }
        if (savePartner) {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData.user?.id;
          if (!uid) {
            toast.error("נדרש חיבור משתמש");
            setSubmitting(false);
            return;
          }
          const { data: created, error } = await supabase
            .from("partner_brokers")
            .insert({
              user_id: uid,
              full_name: newName.trim(),
              email,
              phone,
              agency: newAgency.trim() || null,
            })
            .select("id")
            .single();
          if (error) {
            toast.error("שמירת השותף נכשלה: " + error.message);
            setSubmitting(false);
            return;
          }
          usePartnerId = created.id;
          refetch();
        }
      } else {
        if (!selectedPartner) {
          toast.error("נא לבחור שותף מהרשימה");
          setSubmitting(false);
          return;
        }
        name = selectedPartner.full_name;
      }

      const payload: Record<string, unknown> = {
        partner_broker_id: usePartnerId ?? undefined,
        partner_name: name,
        partner_email: email,
        partner_phone: phone,
        subject_kind: subject.kind,
        subject_label: subject.label,
        channel,
        message_body: body,
      };
      if (subject.kind === "lead") payload.lead_id = subject.id;
      if (subject.kind === "listing") payload.listing_id = subject.id;
      if (commission) {
        const n = Number(commission);
        if (!Number.isNaN(n)) payload.commission_split_pct = n;
      }

      const { data, error } = await supabase.functions.invoke("send-referral", {
        body: payload,
      });
      if (error) {
        toast.error("שליחת ההפניה נכשלה: " + error.message);
        setSubmitting(false);
        return;
      }

      const link = (data as any)?.wa_link || (data as any)?.mailto_link;
      if (link) {
        window.open(link, "_blank");
        toast.success("ההפניה נרשמה ונשלחה");
      } else {
        toast.success("ההפניה נרשמה. שלח ידנית את ההודעה לשותף.");
      }
      onOpenChange(false);
      // soft reset
      setPartnerId("");
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewAgency("");
      setCommission("");
    } catch (e: any) {
      toast.error("שגיאה: " + (e?.message ?? String(e)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> הפניה מקצועית למתווך שותף
          </DialogTitle>
          <DialogDescription className="text-xs">
            {subject.kind === "lead" && `מתעניין: ${subject.label}`}
            {subject.kind === "listing" && `נכס: ${subject.label}`}
            {subject.kind === "other" && subject.label}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="existing">מהרשת שלי</TabsTrigger>
            <TabsTrigger value="new">שותף חדש</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-2 pt-3">
            {partners.length === 0 ? (
              <div className="text-xs text-muted-foreground border rounded p-3">
                עדיין אין שותפים שמורים. עבור ללשונית "שותף חדש".
              </div>
            ) : (
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מתווך מהרשימה" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                      {p.agency ? ` · ${p.agency}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedPartner && (
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                {selectedPartner.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {selectedPartner.email}
                  </span>
                )}
                {selectedPartner.phone && <span dir="ltr">📱 {formatPhoneDisplay(selectedPartner.phone)}</span>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="new" className="space-y-2 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">שם מלא</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סוכנות</Label>
                <Input value={newAgency} onChange={(e) => setNewAgency(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">אימייל</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  maxLength={255}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">טלפון</Label>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  maxLength={40}
                  dir="ltr"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={savePartner}
                onChange={(e) => setSavePartner(e.target.checked)}
              />
              שמור ברשימת השותפים שלי
            </label>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">ערוץ שליחה</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">אימייל</SelectItem>
                <SelectItem value="manual">תיעוד בלבד</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">חלוקת עמלה לשותף (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="לדוגמה: 25"
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-1 pt-2">
          <Label className="text-xs">תוכן ההודעה</Label>
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            שלח הפניה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
