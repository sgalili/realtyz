import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldOff, ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";

type Broker = {
  user_id: string;
  email: string;
  full_name: string | null;
  connection_status: string;
  homely_username: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  webhook_token: string | null;
  has_client_code: boolean;
  auto_push: boolean;
  pushes_last_24h: number;
  push_failures_24h: number;
  last_push_at: string | null;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ok: { label: "תקין", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  manually_verified: { label: "מאומת ידנית", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  failed: { label: "נכשל", className: "bg-red-500/15 text-red-700 border-red-500/30" },
  disabled_by_admin: { label: "הושבת ע״י אדמין", className: "bg-amber-500/15 text-amber-800 border-amber-500/30" },
  not_configured: { label: "לא מוגדר", className: "bg-muted text-muted-foreground border-border" },
};

export default function HomelyAdmin() {
  const { isAdmin, isSuperAdmin } = useUserRole();
  const qc = useQueryClient();
  const [disableTarget, setDisableTarget] = useState<Broker | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["homely-admin-overview"],
    enabled: isAdmin || isSuperAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_homely_admin_overview");
      if (error) throw error;
      return data as { brokers: Broker[]; totals: Record<string, number> };
    },
  });

  const setDisabled = useMutation({
    mutationFn: async (vars: { user_id: string; disabled: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("set_homely_broker_disabled", {
        _user_id: vars.user_id,
        _disabled: vars.disabled,
        _reason: vars.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homely-admin-overview"] });
      toast.success("עודכן בהצלחה");
      setDisableTarget(null);
      setReason("");
    },
    onError: (e: any) => toast.error("שמירה נכשלה: " + e.message),
  });

  const verify = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("homely-verify-login", {
        body: { user_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["homely-admin-overview"] });
      toast.success(d?.ok ? "אומת" : `סטטוס: ${d?.status}`);
    },
    onError: (e: any) => toast.error("בדיקה נכשלה: " + e.message),
  });

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            דף זה זמין למנהלים בלבד.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totals = data?.totals ?? { configured: 0, failing: 0, disabled: 0, pushes_today: 0, failures_today: 0 };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold">ניהול אינטגרציית Homely</h1>
        <p className="text-sm text-muted-foreground mt-1">
          תצוגת אדמין של כל המתווכים המחוברים ל‑Homely, עם אפשרות להשבית או לאמת מחדש כל חשבון.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "מחוברים", value: totals.configured, color: "text-emerald-600" },
          { label: "נכשלים", value: totals.failing, color: "text-red-600" },
          { label: "הושבתו", value: totals.disabled, color: "text-amber-600" },
          { label: "דחיפות היום", value: totals.pushes_today, color: "text-foreground" },
          { label: "כשלי דחיפה היום", value: totals.failures_today, color: "text-red-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">מתווכים</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="text-start p-3">מתווך</th>
                  <th className="text-start p-3">סטטוס</th>
                  <th className="text-start p-3">משתמש Homely</th>
                  <th className="text-start p-3">אומת לאחרונה</th>
                  <th className="text-start p-3">דחיפות 24ש</th>
                  <th className="text-start p-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">טוען…</td></tr>
                )}
                {!isLoading && (data?.brokers ?? []).length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">אין מתווכים מוגדרים עדיין.</td></tr>
                )}
                {(data?.brokers ?? []).map((b) => {
                  const s = STATUS_LABEL[b.connection_status] ?? STATUS_LABEL.not_configured;
                  return (
                    <tr key={b.user_id} className="border-t border-border/40">
                      <td className="p-3">
                        <div className="font-medium">{b.full_name || b.email}</div>
                        <div className="text-xs text-muted-foreground">{b.email}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={s.className}>{s.label}</Badge>
                        {b.last_error && (
                          <div className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {b.last_error}
                          </div>
                        )}
                      </td>
                      <td className="p-3" dir="ltr">{b.homely_username || "—"}</td>
                      <td className="p-3 text-xs">
                        {b.last_verified_at
                          ? new Date(b.last_verified_at).toLocaleString("he-IL")
                          : "—"}
                      </td>
                      <td className="p-3">
                        <div className="text-sm">{b.pushes_last_24h}</div>
                        {b.push_failures_24h > 0 && (
                          <div className="text-[10px] text-red-600">{b.push_failures_24h} כשלים</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => verify.mutate(b.user_id)}
                            disabled={verify.isPending}
                          >
                            <RefreshCw className="h-3.5 w-3.5 ml-1" /> בדוק
                          </Button>
                          {b.connection_status === "disabled_by_admin" ? (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setDisabled.mutate({ user_id: b.user_id, disabled: false })}
                            >
                              <ShieldCheck className="h-3.5 w-3.5 ml-1 text-emerald-600" /> הפעל
                            </Button>
                          ) : (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setDisableTarget(b)}
                            >
                              <ShieldOff className="h-3.5 w-3.5 ml-1 text-red-600" /> השבת
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>השבתת אינטגרציית Homely</DialogTitle>
            <DialogDescription>
              השבתה תמנע מ‑{disableTarget?.full_name || disableTarget?.email} לשלוח לידים אוטומטית ל‑Homely עד שתפעיל מחדש.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">סיבה</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="לדוגמה: חשבון פג תוקף" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>ביטול</Button>
            <Button
              variant="destructive"
              onClick={() => disableTarget && setDisabled.mutate({
                user_id: disableTarget.user_id, disabled: true, reason,
              })}
              disabled={setDisabled.isPending}
            >
              השבת חיבור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
