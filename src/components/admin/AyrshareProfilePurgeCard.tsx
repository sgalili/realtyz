import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Admin-only purge tool for suspended/stale Ayrshare profiles.
 * Sends DELETE /api/profiles to Ayrshare with a specific Profile-Key.
 * Suspended profiles cannot be removed via the Ayrshare dashboard, so we
 * surgically wipe them here. One profile per click — no bulk loops.
 */
export function AyrshareProfilePurgeCard() {
  const [profileKey, setProfileKey] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleDelete = async () => {
    const key = profileKey.trim();
    if (!key) { toast.error('הדבק Profile-Key למחיקה'); return; }
    if (!confirm(`למחוק לצמיתות את הפרופיל ${key.slice(0, 12)}…?`)) return;
    setWorking(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ayrshare-profile-delete', {
        body: { profile_key: key },
      });
      if (error) throw error;
      setResult(data);
      const payload = data as { ok?: boolean; status?: number };
      if (payload?.ok) {
        toast.success('הפרופיל נמחק מ-Ayrshare');
        setProfileKey('');
      } else {
        toast.error(`Ayrshare החזיר ${payload?.status ?? '?'} — ראה פרטים למטה`);
      }
    } catch (e) {
      toast.error(`שגיאה: ${(e as Error).message}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-destructive/40" dir="rtl">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <h3 className="text-sm font-bold">מחיקת פרופיל Ayrshare מושעה</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        כלי חירום למחיקה כירורגית של פרופיל Ayrshare שהושעה ולא ניתן להסיר מלוח-הבקרה.
        השתמש בכל Profile-Key אחד בלבד. הפעולה בלתי הפיכה.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">Profile-Key למחיקה</Label>
        <Input
          dir="ltr"
          value={profileKey}
          onChange={(e) => setProfileKey(e.target.value)}
          placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
          className="font-mono text-xs"
        />
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={working || !profileKey.trim()}
        className="gap-1.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {working ? 'מוחק…' : 'מחק פרופיל מ-Ayrshare'}
      </Button>
      {result != null && (
        <pre className="text-[10px] bg-muted/40 p-2 rounded max-h-40 overflow-auto" dir="ltr">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </Card>
  );
}
