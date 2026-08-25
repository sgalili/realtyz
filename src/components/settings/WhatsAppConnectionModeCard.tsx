import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { BadgeCheck, Building2, ShieldCheck, Smartphone } from 'lucide-react';

/**
 * WhatsApp messaging runs exclusively on the Official WhatsApp Business API
 * (Meta Cloud API). There is no alternative gateway and no QR-session mode:
 * every inbound message and every outbound reply flows through Meta only.
 */
export function WhatsAppConnectionModeCard() {
  const ownerId = useActiveWorkspaceOwnerId();
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState<string>('');

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      // Pin the workspace to the official transport (idempotent).
      await supabase
        .from('workspace_whatsapp_settings' as never)
        .upsert(
          { workspace_owner_id: ownerId, connection_type: 'official_meta' } as never,
          { onConflict: 'workspace_owner_id' } as never,
        );

      const { data } = await supabase
        .from('wa_providers' as never)
        .select('config')
        .limit(1)
        .maybeSingle();
      const cfg = (data as unknown as { config?: Record<string, unknown> } | null)?.config ?? {};
      const display = String(cfg?.display_phone_number ?? cfg?.phone_number ?? '');
      if (!cancelled) {
        setPhone(display);
        setLoading(false);
      }
    })().catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  return (
    <Card className="border-blue-200" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-blue-600" />
          חיבור WhatsApp למרחב העבודה
        </CardTitle>
        <CardDescription>
          כל ההודעות, הצ׳אטים ותיבת הדואר הנכנס פועלים דרך ה-WhatsApp Business API הרשמי של Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="rounded-lg border border-blue-500 bg-blue-50/60 p-4 ring-1 ring-blue-300">
              <div className="flex items-center justify-between">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">WhatsApp Business API רשמי (Meta Cloud API)</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                שליחה וקבלה מתבצעות ישירות מול Meta. אין צורך בסריקת QR ואין ספק חלופי.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700">
                  <BadgeCheck className="h-3 w-3" /> פעיל
                </Badge>
                {phone && (
                  <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
                    <span dir="ltr">{phone}</span>
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-dashed border-blue-300 bg-background p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                לשליחה מחוץ לחלון 24 השעות יש להשתמש בתבניות מאושרות של Meta. ניהול התבניות מתבצע
                בכרטיס סנכרון התבניות בהגדרות.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default WhatsAppConnectionModeCard;
