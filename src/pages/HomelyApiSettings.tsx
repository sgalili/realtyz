import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function HomelyApiSettings() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("homely_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) toast.error("שגיאה בטעינת מפתח API");
      if (data?.homely_api_key) {
        setApiKey(data.homely_api_key);
        setHasKey(true);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!apiKey.trim()) {
      toast.error("יש להזין מפתח API");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_api_keys")
      .upsert(
        { user_id: user.id, homely_api_key: apiKey.trim(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    setSaving(false);
    if (error) {
      toast.error("שמירה נכשלה: " + error.message);
      return;
    }
    setHasKey(true);
    toast.success("מפתח Homely API נשמר בהצלחה");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10 space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">הגדרות API</h1>
        <p className="text-muted-foreground">נהל את מפתחות ה-API החיצוניים שלך באופן מאובטח.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Homely API Key</CardTitle>
              <CardDescription>מפתח לחיבור לשירותי Homely</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="homely-key">Homely API Key</Label>
            <div className="relative">
              <Input
                id="homely-key"
                type={show ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="הדבק את המפתח כאן..."
                autoComplete="off"
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 end-2 flex items-center text-muted-foreground hover:text-foreground"
                aria-label={show ? "הסתר" : "הצג"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {hasKey && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
              <span>מפתח שמור ומאובטח</span>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <><Loader2 className="h-4 w-4 me-2 animate-spin" /> שומר...</>
            ) : (
              <><Save className="h-4 w-4 me-2" /> שמור מפתח</>
            )}
          </Button>

          <p className="text-xs text-muted-foreground leading-relaxed">
            המפתח מאוחסן במאגר נתונים מאובטח עם RLS — רק את/ה יכול/ה לגשת אליו.
            השימוש במפתח מתבצע דרך Edge Function בצד השרת בלבד.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
