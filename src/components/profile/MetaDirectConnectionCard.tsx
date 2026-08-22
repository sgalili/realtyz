import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Facebook, Instagram, Loader2, RefreshCw } from 'lucide-react';

export type MetaStatus = {
  connected: boolean;
  facebook: { id: string; name: string | null } | null;
  instagram: { id: string; username: string | null } | null;
  message?: string | null;
};

/** Direct Meta Graph API publishing status (Facebook Page + Instagram Business). */
export function MetaDirectConnectionCard({ onStatus }: { onStatus?: (s: MetaStatus | null) => void }) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const probe = useCallback(async (notify = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-publish', { body: { action: 'status' } });
      if (error) throw error;
      const s = data as MetaStatus;
      setStatus(s);
      onStatus?.(s);
      if (notify) {
        if (s?.connected) toast.success('החיבור לפייסבוק תקין');
        else toast.error(s?.message || 'דף הפייסבוק אינו מחובר');
      }
    } catch (e: any) {
      setStatus(null);
      onStatus?.(null);
      if (notify) toast.error(`בדיקת החיבור נכשלה: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => { probe(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <Card dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Facebook className="h-5 w-5 text-primary" />
          <span>פרסום ישיר לפייסבוק ואינסטגרם (Meta Graph)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          הפוסטים והקמפיינים מתפרסמים ישירות דרך ה-API הרשמי של Meta, ללא ספק ביניים.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status?.facebook ? 'default' : 'secondary'} className="gap-1.5">
            <Facebook className="h-3.5 w-3.5" />
            {status?.facebook ? `דף: ${status.facebook.name ?? status.facebook.id}` : 'דף פייסבוק לא מחובר'}
          </Badge>
          <Badge variant={status?.instagram ? 'default' : 'secondary'} className="gap-1.5">
            <Instagram className="h-3.5 w-3.5" />
            {status?.instagram
              ? `אינסטגרם: @${status.instagram.username ?? status.instagram.id}`
              : 'אינסטגרם לא מקושר'}
          </Badge>
        </div>
        {status && !status.connected && status.message && (
          <p className="text-xs text-destructive">{status.message}</p>
        )}
        <Button variant="outline" size="sm" onClick={() => probe(true)} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          בדיקת חיבור
        </Button>
      </CardContent>
    </Card>
  );
}
