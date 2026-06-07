import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

export default function AiDialer() {
  const [leadId, setLeadId] = useState<string>("");
  const [listingId, setListingId] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: leads = [] } = useQuery({
    queryKey: ["dialer-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, phone_number, city")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: listings = [] } = useQuery({
    queryKey: ["dialer-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, property_title, city, asking_price")
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const onSelectLead = (id: string) => {
    setLeadId(id);
    const lead = leads.find((l) => l.id === id);
    setPhone(lead?.phone_number ?? "");
  };

  const verify = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("vapi-verify-credentials", { method: "POST" });
      if (error) throw error;
      const v: any = (data as any)?.vapi ?? {};
      if (v.ok) toast.success(`Vapi: ${v.message}`);
      else toast.error(v.message || "שגיאת התחברות - בדוק את מפתחות ה-API שלך");
    } catch {
      toast.error("שגיאת התחברות - בדוק את מפתחות ה-API שלך");
    } finally {
      setTesting(false);
    }
  };

  const startCall = async () => {
    if (!phone) {
      toast.error("חסר מספר טלפון");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vapi-outbound-call", {
        body: {
          phone_number: phone,
          lead_id: leadId || undefined,
          listing_id: listingId || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("השיחה הופעלה");
    } catch (e: any) {
      toast.error(`כשל בהפעלת השיחה: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">חייגן AI</h1>
        <p className="text-muted-foreground text-sm">
          הפעלת שיחה אוטונומית עם לקוח דרך Vapi · כלים חיים: WhatsApp (Green API), SMS (019), חיוג Twilio.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>הפעלת חיוג</span>
            <Button size="sm" variant="outline" onClick={verify} disabled={testing}>
              {testing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <PlugZap className="ml-2 h-4 w-4" />}
              בדוק חיבור Vapi
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>בחירת מתעניין</Label>
            <Select value={leadId} onValueChange={onSelectLead}>
              <SelectTrigger><SelectValue placeholder="בחר מתעניין מהרשימה" /></SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.full_name ?? "ללא שם"} · {l.phone_number ?? "ללא טלפון"} · {l.city ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>נכס לדיון (Context IVR)</Label>
            <Select value={listingId} onValueChange={setListingId}>
              <SelectTrigger><SelectValue placeholder="בחר נכס שיוטען לסוכן" /></SelectTrigger>
              <SelectContent>
                {listings.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.property_title ?? "ללא כותרת"} · {l.city ?? ""} · ₪{l.asking_price ?? "?"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">מספר טלפון</Label>
            <Input
              id="phone"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+9725XXXXXXXX או 05XXXXXXXX"
            />
          </div>
          <Button onClick={startCall} disabled={loading || !phone} className="w-full">
            {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Phone className="ml-2 h-4 w-4" />}
            התקשר עכשיו
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
