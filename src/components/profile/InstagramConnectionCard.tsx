import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Instagram, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useFacebookHealth, useRefreshFacebookHealth } from '@/hooks/useFacebookHealth';
import { callMetaPageConnect } from '@/lib/facebookPageConnect';

/**
 * InstagramConnectionCard — standalone Instagram connection card.
 *
 * Instagram Business accounts authenticate THROUGH the linked Facebook Page
 * (Meta has no separate Instagram OAuth for publishing), so this card manages
 * its own status badge and actions while the underlying token lives on the
 * Facebook Page binding. "מחובר" requires BOTH a verified live Page token AND
 * a linked Instagram professional account — anything else shows "לא מחובר".
 */
export function InstagramConnectionCard() {
  const { data: health, isPending } = useFacebookHealth();
  const refreshHealth = useRefreshFacebookHealth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // STRICT true-state: verified Page token AND a linked IG account.
  const igConnected =
    health?.needsReconnect !== true &&
    !!health?.pageConnected &&
    !!health?.instagram?.id;
  const igHandle = igConnected ? health?.instagram?.username ?? health?.instagram?.id ?? null : null;

  const checkConnection = async () => {
    if (checking) return;
    setChecking(true);
    try {
      // Live probe against Graph — refreshes the shared health cache.
      const res = await callMetaPageConnect<{ connected?: boolean; instagram?: { id?: string; username?: string | null } | null }>({
        action: 'status',
      }).catch(() => null);
      refreshHealth();
      if (res?.connected && res?.instagram?.id) {
        toast.success('אינסטגרם מחובר', { description: res.instagram.username ? `@${res.instagram.username}` : undefined });
      } else if (res?.connected) {
        toast.message('עמוד הפייסבוק מחובר, אך לא נמצא חשבון אינסטגרם מקושר', {
          description: 'קשרו חשבון אינסטגרם מקצועי לעמוד ונסו שוב.',
        });
        setHelpOpen(true);
      } else {
        toast.error('אינסטגרם לא מחובר', {
          description: 'יש לחבר קודם את עמוד הפייסבוק בכרטיס הפייסבוק.',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card dir="rtl" className="text-right">
      <CardContent className="space-y-4 pt-4">
        {igConnected ? (
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E4405F]/10">
              <Instagram className="h-5 w-5 text-[#E4405F]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold" dir="ltr">@{igHandle}</p>
              <p className="text-[12px] text-muted-foreground">חשבון עסקי מקושר דרך עמוד הפייסבוק</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[13px]"
              disabled={checking}
              onClick={() => void checkConnection()}
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              בדוק חיבור
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <Button
              onClick={() => void checkConnection()}
              disabled={checking || isPending}
              className="w-full gap-2 bg-[#E4405F] text-white hover:bg-[#E4405F]/90"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
              {checking ? 'בודק חיבור…' : 'חבר אינסטגרם'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 text-[13px]"
              onClick={() => setHelpOpen(true)}
            >
              <Instagram className="h-3.5 w-3.5" /> איך מחברים?
            </Button>
          </div>
        )}

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent dir="rtl" className="text-right sm:max-w-md">
            <DialogHeader className="text-right">
              <DialogTitle>חיבור אינסטגרם ב-3 צעדים</DialogTitle>
              <DialogDescription>
                אינסטגרם מתחבר דרך עמוד הפייסבוק — אין צורך בהתחברות נפרדת.
              </DialogDescription>
            </DialogHeader>
            <ol className="list-inside list-decimal space-y-1.5 text-[15px] text-muted-foreground">
              <li>ודא שחשבון האינסטגרם הוא חשבון מקצועי (Business או Creator).</li>
              <li>באפליקציית אינסטגרם: הגדרות ← קישור חשבונות ← פייסבוק, ובחר את עמוד הפייסבוק המחובר כאן.</li>
              <li>חזור לכאן — האינסטגרם יופיע מקושר אוטומטית.</li>
            </ol>
            <Button
              type="button"
              size="sm"
              className="h-8 text-[15px]"
              disabled={checking}
              onClick={() => { setHelpOpen(false); void checkConnection(); }}
            >
              בדוק חיבור אינסטגרם
            </Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
