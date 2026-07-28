import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type CachedTemplate = {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  synced_at: string;
};

/**
 * Syncs approved Meta WABA templates into the local cache so chats and
 * campaigns can select them instantly.
 */
export const WaTemplatesSyncCard = () => {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['wa-message-templates-cache'],
    queryFn: async (): Promise<CachedTemplate[]> => {
      const { data, error } = await supabase
        .from('wa_message_templates')
        .select('id, name, language, category, status, synced_at')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CachedTemplate[];
    },
  });

  const sync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-wa-templates', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'הסנכרון נכשל');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wa-message-templates-cache'] }),
        queryClient.invalidateQueries({ queryKey: ['meta-wa-templates'] }),
      ]);
      toast.success(`סונכרנו ${data.synced ?? 0} תבניות (${data.approved_count ?? 0} מאושרות)`);
    } catch (e: any) {
      toast.error('סנכרון התבניות נכשל', { description: e?.message });
    } finally {
      setSyncing(false);
    }
  };

  const lastSync = templates?.[0]?.synced_at
    ? new Date(templates.reduce((a, t) => (t.synced_at > a ? t.synced_at : a), templates[0].synced_at))
    : null;

  return (
    <Card dir="rtl" className="border-blue-200 bg-blue-50/40">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-blue-600" />
          תבניות WhatsApp
        </CardTitle>
        <Button size="sm" variant="outline" onClick={sync} disabled={syncing} className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
          {syncing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <RefreshCw className="ml-2 h-4 w-4" />}
          סנכרון מ-Meta
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : (templates?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">אין תבניות מסונכרנות. לחץ על "סנכרון מ-Meta".</p>
        ) : (
          <>
            <ul className="divide-y divide-blue-200/60 rounded-md border border-blue-200 bg-background/60">
              {templates!.map((t) => {
                const approved = t.status?.toUpperCase() === 'APPROVED';
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{t.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {t.category && (
                        <Badge variant="outline" className="border-blue-200 text-[11px] text-blue-700">
                          {t.category}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${approved ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                      >
                        {approved ? 'פעילה' : t.status}
                      </Badge>
                      <span className="text-[11px] uppercase text-muted-foreground">{t.language}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {lastSync && (
              <p className="text-[11px] text-muted-foreground">
                סונכרן לאחרונה: {lastSync.toLocaleString('he-IL')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WaTemplatesSyncCard;
