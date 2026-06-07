import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from("profiles")
        .select("email_alias").eq("id", user.id).maybeSingle();
      setAlias((data as any)?.email_alias ?? "");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("יש להתחבר");
      const clean = alias.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32);
      const { error } = await supabase.from("profiles")
        .update({ email_alias: clean || null }).eq("id", user.id);
      if (error) throw error;
      setAlias(clean);
      toast.success("כתובת המייל המותג נשמרה");
    } catch (e: any) {
      toast.error(`שמירה נכשלה: ${e?.message ?? e}`);
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
          <span>כתובת מייל מותג (Resend)</span>
          <Mail className="h-5 w-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground text-right">
          בחר את ה-prefix שיופיע לפני {DOMAIN} בכל אימייל יוצא מהקמפיינים שלך. דוגמה: <code dir="ltr">udi{DOMAIN}</code>.
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
              disabled={loading}
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
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
            שמור כתובת
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default EmailAliasCard;
