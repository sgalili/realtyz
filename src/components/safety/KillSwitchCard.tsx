import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Power, ShieldOff } from 'lucide-react';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function KillSwitchCard() {
  const { settings, isLoading, update } = usePlatformSettings();
  const { isAdmin, isManagingBroker, isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canSee = isAdmin || isManagingBroker || isSuperAdmin;
  if (!canSee) return null;
  if (isLoading) return null;

  const paused = settings.ai_paused;

  const pause = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await update({
        ai_paused: true,
        ai_paused_reason: reason.trim() || null,
        ai_paused_at: new Date().toISOString(),
      });
      // Best-effort audit trail
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: 'kill_switch_engaged',
        target_table: 'platform_settings',
        target_id: user.id,
        details: { reason: reason.trim() || null },
      });
      toast.success('Kill Switch הופעל. כל ההודעות האוטומטיות הושהו.');
      setConfirmOpen(false);
      setReason('');
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await update({ ai_paused: false, ai_paused_reason: null, ai_paused_at: null });
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: 'kill_switch_released',
        target_table: 'platform_settings',
        target_id: user.id,
        details: {},
      });
      toast.success('ה-AI חוזר לפעילות.');
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  if (paused) {
    return (
      <Card className="border-destructive/60 bg-destructive/5">
        <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0 animate-pulse">
            <ShieldOff className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-destructive">Kill Switch פעיל</div>
            <div className="text-xs text-destructive/80 mt-0.5">
              כל ההודעות האוטומטיות הושהו
              {settings.ai_paused_at && ' · '}
              {settings.ai_paused_at && new Date(settings.ai_paused_at).toLocaleString('he-IL')}
              {settings.ai_paused_reason && ` · ${settings.ai_paused_reason}`}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={resume}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
          >
            <Power className="h-4 w-4 ml-1.5" />
            חידוש פעילות AI
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-warning/40">
        <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Kill Switch · עצירת חירום</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              משבית מידית את כל ההודעות האוטומטיות — לתורים, לפניות, ולמעקבים.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
          >
            <ShieldOff className="h-4 w-4 ml-1.5" />
            עצור AI
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="h-5 w-5" />
              להפעיל Kill Switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תעצור מידית את כל ההודעות האוטומטיות של ה-AI: תור Autopilot, מעקבים, שידור לקהילה, ושליחות יוצאות. הודעות נכנסות עדיין יישמרו ויוצגו בתיבה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">סיבה (לרישום)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="לדוגמה: באג בתבנית, חג, בדיקות תחזוקה..."
              rows={3}
              maxLength={300}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={pause}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <ShieldOff className="h-4 w-4 ml-1.5" />
              כן, עצור AI
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default KillSwitchCard;
