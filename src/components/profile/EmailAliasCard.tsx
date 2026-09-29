import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleServiceConnectCard } from "@/components/profile/GoogleServiceConnectCard";

const DOMAIN = "@realtyz.co.il";

/**
 * Lets each broker pick the local-part of their branded sender address.
 * Stored on `profiles.email_alias`. The DB trigger normalizes to
 * `[a-z0-9._-]{1,32}`. The resend-email-sender edge function reads this
 * to build the From: header for outbound campaign emails.
 */
export function EmailAliasCard() {
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gmail, setGmail] = useState(false);
  const [isOwner, setIsOwner] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_workspace_mailbox" as never);
      const mb = (data ?? {}) as any;
      setAlias(mb.alias ?? "");
      setGmail(!!mb.gmail_connected);
      setIsOwner(mb.is_owner !== false);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_workspace_email_alias" as never, { p_alias: alias } as never);
      if (error) throw error;
      setAlias(String(data ?? "").split("@")[0]);
      toast.success("תיבת המייל של מרחב העבודה נשמרה");
    } catch (e: any) {
      const m = String(e?.message ?? e);
      toast.error(
        m.includes("alias_taken") ? "הכתובת תפוסה, בחרו שם אחר"
        : m.includes("alias_reserved") ? "כתובת זו שמורה למערכת, בחרו שם אחר"
        : m.includes("alias_too_short") ? "יש להזין לפחות 2 תווים"
        : m.includes("only_workspace_owner") ? "רק בעל מרחב העבודה יכול לשנות את התיבה"
        : `שמירה נכשלה: ${m}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const previewAddress = alias
    ? `${alias.toLowerCase().replace(/[^a-z0-9._-]/g, "")}${DOMAIN}`
    : `prefix${DOMAIN}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right flex items-center gap-2 justify-end">
          <span>תיבת מייל של מרחב העבודה</span>
          <Mail className="h-5 w-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground text-right">
          תיבה אחת לכל מרחב העבודה, לשליחה ולקבלת מיילים. תשובות מאנשי קשר נכנסות אוטומטית לתיבת השיחות. דוגמה: <code dir="ltr">udi{DOMAIN}</code>.
        </p>
        <p className="text-xs text-right rounded-md bg-muted px-3 py-2">
          {gmail
            ? "Gmail מחובר ומשמש לשליחה. כתובת זו היא אפשרות גיבוי."
            : "Gmail לא מחובר, לכן המיילים יישלחו מכתובת זו."}
        </p>
        <div className="space-y-2">
          <Label htmlFor="email-alias" className="text-right block">Prefix</Label>
          <div className="flex items-center" dir="ltr">
            <Input
              id="email-alias"
              dir="ltr"
              placeholder="udi"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              disabled={loading || !isOwner}
              className="rounded-r-none border-r-0 font-mono"
            />
            <span className="inline-flex h-10 items-center rounded-l-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground font-mono whitespace-nowrap">
              {DOMAIN}
            </span>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            תצוגה מקדימה: <code dir="ltr" className="text-foreground">{previewAddress}</code>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving || loading || !isOwner}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            שמור כתובת
          </Button>
        </div>

        <GoogleServiceConnectCard
          platform="gmail"
          title="חיבור Gmail"
          hint="חבר את כתובת ה-Gmail שלך כדי לשלוח ולקרוא מיילים ישירות מ-Realtyz."
        />
      </CardContent>
    </Card>
  );
}

export default EmailAliasCard;
