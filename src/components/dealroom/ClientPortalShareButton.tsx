import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check, RefreshCw, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  leadId: string;
  leadName?: string | null;
  leadPhone?: string | null;
  className?: string;
}

function genToken(): string {
  // 32-byte URL-safe token
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default function ClientPortalShareButton({
  leadId,
  leadName,
  leadPhone,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function ensureLink(forceNew = false) {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let row: { token: string } | null = null;

      if (!forceNew) {
        const { data } = await supabase
          .from("client_portal_links")
          .select("token, expires_at, revoked_at")
          .eq("lead_id", leadId)
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data && new Date(data.expires_at).getTime() > Date.now()) {
          row = { token: data.token };
        }
      }

      if (!row) {
        const token = genToken();
        const { data, error } = await supabase
          .from("client_portal_links")
          .insert({ lead_id: leadId, user_id: user.id, token })
          .select("token")
          .single();
        if (error) throw error;
        row = { token: data.token };
      }

      const portalUrl = `${window.location.origin}/portal/${row.token}`;
      setUrl(portalUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה ביצירת קישור");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    setOpen(true);
    if (!url) await ensureLink(false);
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("הקישור הועתק");
    setTimeout(() => setCopied(false), 1800);
  }

  function sendWhatsApp() {
    if (!url) return;
    const phone = (leadPhone ?? "").replace(/\D/g, "");
    const msg = encodeURIComponent(
      `שלום${leadName ? ` ${leadName.split(" ")[0]}` : ""}, הכנתי לך פורטל אישי לעקוב אחרי התקדמות העסקה והנכסים שאנחנו בוחנים יחד:\n${url}`,
    );
    const target = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(target, "_blank", "noopener");
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={className}
        onClick={handleOpen}
      >
        <Share2 className="h-4 w-4 ml-1" />
        פורטל לקוח
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>פורטל לקוח · קישור משותף</DialogTitle>
            <DialogDescription>
              קישור מאובטח אישי ללקוח לעקוב אחרי שלב העסקה והנכסים. כל כניסה
              נרשמת בציר הזמן של הליד.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              value={loading ? "מכין קישור…" : (url ?? "")}
              readOnly
              dir="ltr"
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              תוקף ברירת מחדל: 60 יום. ניתן ליצור קישור חדש בכל עת — הישן יישאר תקף עד פקיעתו.
            </p>
          </div>

          <DialogFooter className="flex-row sm:justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => ensureLink(true)}
            >
              <RefreshCw className="h-3.5 w-3.5 ml-1" />
              צור חדש
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!url}
                onClick={copy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 ml-1" />
                ) : (
                  <Copy className="h-3.5 w-3.5 ml-1" />
                )}
                העתק
              </Button>
              <Button size="sm" disabled={!url} onClick={sendWhatsApp}>
                <MessageCircle className="h-3.5 w-3.5 ml-1" />
                שלח ב-WhatsApp
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
