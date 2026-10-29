import { useQuery } from '@tanstack/react-query';
import { openFacebookConnection } from '@/lib/facebookConnectionFlow';
import { ShieldCheck, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { summarizeCapacity, type FbPostingCapacity } from '@/lib/fbPostingCapacity';

export function useFbPostingCapacity() {
  const { user } = useAuth();
  const { activeWorkspaceId: ws } = useWorkspace();
  return useQuery({
    queryKey: ['fb-posting-capacity', user?.id, ws],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fb_posting_capacity' as any);
      if (error) throw error;
      return data as unknown as FbPostingCapacity;
    },
  });
}

/** Shown only when today's safe posting limit has been reached. */
export default function DailyPostingLimitNotice({ always = false }: { always?: boolean }) {
  const { data } = useFbPostingCapacity();
  const s = summarizeCapacity(data);
  if (!s || (!s.reached && !always)) return null;
  return (
    <div dir="rtl" className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {s.reached ? 'הגעת למכסת הפרסום היומית' : 'מכסת פרסום יומית'} · {s.used}/{s.total}
        </p>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        כדי לשמור על החשבון שלך בטוח, כל דף עסקי מפרסם עד {data!.per_page_limit} פוסטים ביום, עם רווח של כמה דקות בין פוסט לפוסט. כל הדפים יחד מוגבלים ל־{data!.account_limit} ביום. הפוסטים הנותרים ימשיכו אוטומטית מחר בבוקר.
      </p>
      {s.canAddPage && (
        <Button size="sm" className="gap-1" onClick={openFacebookConnection}>
          <Plus className="h-4 w-4" />חבר דף פייסבוק עסקי נוסף
        </Button>
      )}
    </div>
  );
}
