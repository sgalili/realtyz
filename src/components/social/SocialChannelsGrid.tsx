// Dynamic Ayrshare social channels grid for the RZ workspace.
// Calls ayrshare-networks (catalog + live linked-state + per-Page FB rows)
// and ayrshare-sync-accounts (import / refresh sub-accounts). For Facebook
// we render one row PER linked Page plus a "+ הוסף עמוד נוסף" button that
// re-opens the Ayrshare connect URL so additional Pages can be linked under
// the same workspace profile.
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, Link2, AlertCircle, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Network = {
  id: string;
  name: string;
  hint: string | null;
  connected: boolean;
  accountName: string | null;
  requiresSetup: boolean;
  setupNote: string | null;
};

type FacebookPage = {
  id: string;
  pageId: string;
  name: string | null;
  avatarUrl: string | null;
};

type NetworksResponse = {
  networks: Network[];
  profileKey: string | null;
  provisioned: boolean;
  facebookPages?: FacebookPage[];
};

export const SocialChannelsGrid = () => {
  const qc = useQueryClient();

  const networksQ = useQuery<NetworksResponse>({
    queryKey: ['ayrshare', 'networks'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ayrshare-networks', { body: {} });
      if (error) throw error;
      return data as NetworksResponse;
    },
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ayrshare-sync-accounts', { body: {} });
      if (error) throw error;
      return data as { synced: number; reason?: string };
    },
    onSuccess: (data) => {
      if (data.reason === 'no_workspace_profile_key') {
        toast.error('עדיין לא חוברה פרופיל Ayrshare — לחצו תחילה על חיבור החשבון.');
      } else if (data.reason === 'ayrshare_rejected') {
        toast.error('Ayrshare דחתה את הבקשה. בדקו את מפתח ה-API והפרופיל.');
      } else {
        toast.success(`סונכרנו ${data.synced} ערוצים / עמודים.`);
      }
      qc.invalidateQueries({ queryKey: ['ayrshare', 'networks'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'הסנכרון נכשל'),
  });

  const connectAyrshare = useMutation({
    mutationFn: async (platform: string = 'facebook') => {
      const { data, error } = await supabase.functions.invoke('ayrshare-social-link', {
        body: { platform },
      });
      if (error) throw error;
      return data as { url?: string };
    },
    onSuccess: (data) => {
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
      qc.invalidateQueries({ queryKey: ['ayrshare', 'networks'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'יצירת חיבור נכשלה'),
  });

  const connectedCount = useMemo(
    () => networksQ.data?.networks.filter((n) => n.connected).length ?? 0,
    [networksQ.data],
  );

  const facebookPages = networksQ.data?.facebookPages ?? [];

  return (
    <Card dir="rtl" className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              ערוצי תקשורת חברתיים · Social Channels
            </CardTitle>
            <CardDescription className="text-xs">
              חיבור דינמי לכל הרשתות הנתמכות דרך Ayrshare. ניתן לחבר מספר עמודי פייסבוק תחת אותו פרופיל.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connectedCount > 0 ? 'default' : 'secondary'}>
              {connectedCount} מחובר
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !networksQ.data?.provisioned}
            >
              {syncMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ms-2">ייבא חשבונות</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!networksQ.data?.provisioned && !networksQ.isLoading && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div>
                עדיין לא נוצר פרופיל Ayrshare ייעודי לסביבה הזו. לחיצה תפתח חיבור מאובטח —
                פרופיל חדש יוקצה אוטומטית לסביבת העבודה שלך.
              </div>
              <Button size="sm" onClick={() => connectAyrshare.mutate('facebook')} disabled={connectAyrshare.isPending}>
                {connectAyrshare.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span className="ms-2">צור פרופיל וחיבור</span>
              </Button>
            </div>
          </div>
        )}

        {networksQ.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : networksQ.error ? (
          <div className="text-xs text-destructive">לא ניתן לטעון את רשימת הערוצים.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(networksQ.data?.networks ?? []).map((n) => {
              // Special render for Facebook: one row per linked Page +
              // "add another page" trigger that reopens the OAuth connect URL.
              if (n.id === 'facebook') {
                const pages = facebookPages;
                return (
                  <div
                    key={n.id}
                    className={`rounded-md border p-3 text-xs flex flex-col gap-2 transition-colors col-span-1 sm:col-span-2 lg:col-span-3 ${
                      n.connected ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/50 bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {n.connected && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="מחובר" />
                        )}
                        <span className="font-semibold">{n.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => connectAyrshare.mutate('facebook')}
                        disabled={connectAyrshare.isPending}
                        className="h-7 gap-1"
                      >
                        {connectAyrshare.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Plus className="h-3.5 w-3.5" />}
                        <span>{pages.length > 0 ? 'הוסף עמוד נוסף' : 'חבר עמוד'}</span>
                      </Button>
                    </div>

                    {pages.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {pages.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-background/60 px-2 py-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            {p.avatarUrl ? (
                              <img
                                src={p.avatarUrl}
                                alt=""
                                className="h-5 w-5 rounded-full object-cover shrink-0"
                                loading="lazy"
                              />
                            ) : null}
                            <a
                              href={`https://www.facebook.com/${p.pageId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate flex-1 text-foreground hover:underline"
                              title={p.name ?? p.pageId}
                            >
                              {p.name ?? p.pageId}
                            </a>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{p.pageId}</span>

                          </div>
                        ))}
                      </div>
                    ) : n.hint ? (
                      <div className="text-muted-foreground line-clamp-2">{n.hint}</div>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={n.id}
                  className={`rounded-md border p-3 text-xs flex flex-col gap-1 transition-colors ${
                    n.connected
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/50 bg-background'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {n.connected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="מחובר" />
                      )}
                      <span className="font-semibold">{n.name}</span>
                    </div>
                    {n.connected ? (
                      <Badge variant="default">מחובר</Badge>
                    ) : n.requiresSetup ? (
                      <Badge variant="outline">דורש הגדרה</Badge>
                    ) : (
                      <Badge variant="secondary">לא מחובר</Badge>
                    )}
                  </div>
                  {n.accountName && (
                    <div className="text-muted-foreground truncate">{n.accountName}</div>
                  )}
                  {n.hint && !n.accountName && (
                    <div className="text-muted-foreground line-clamp-2">{n.hint}</div>
                  )}
                  {n.requiresSetup && n.setupNote && (
                    <div className="text-amber-600 text-[11px]">{n.setupNote}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SocialChannelsGrid;
