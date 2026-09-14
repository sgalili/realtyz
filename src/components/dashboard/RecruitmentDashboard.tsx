import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, startOfDay, subDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Megaphone, Users, MessageCircle, UserPlus, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import VoterAvatar from '@/components/VoterAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';

/* ────────────────────────────────────────────────────────────────────
   Rita's workspace dashboard — marketing Realtyz to real-estate agents.
   Agent acquisition, publishing and communication only.
   No properties, no deals, no partners.
   ──────────────────────────────────────────────────────────────────── */

export function RecruitmentDashboard() {
  const navigate = useNavigate();
  const ownerId = useActiveWorkspaceOwnerId();

  const hydrateAvatar = useCallback(async (leadId: string | null | undefined) => {
    if (!leadId || !ownerId) return;
    await supabase.functions.invoke('fetch-wa-avatars', {
      body: { lead_ids: [leadId], owner_id: ownerId, limit: 1 },
    }).catch(() => undefined);
  }, [ownerId]);

  const { data: brokerContacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['rita-broker-contacts', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: newSignups, isLoading: loadingSignups } = useQuery({
    queryKey: ['rita-new-signups', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { count } = await (supabase as any)
        .from('demo_requests')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: messagesToday, isLoading: loadingMessages } = useQuery({
    queryKey: ['rita-messages-today', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = startOfDay(new Date()).toISOString();
      const { count } = await (supabase as any)
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: publishedPosts, isLoading: loadingPosts } = useQuery({
    queryKey: ['rita-published-posts', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const since = subDays(new Date(), 30).toISOString();
      const { count } = await (supabase as any)
        .from('campaign_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: recentSignups } = useQuery({
    queryKey: ['rita-recent-signups', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('demo_requests')
        .select('id, first_name, last_name, phone, notes, status, created_at, lead_id, lead:leads!demo_requests_lead_id_fkey(id, full_name, profile_picture_url)')
        .order('created_at', { ascending: false })
        .limit(6);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const { data: recentReplies } = useQuery({
    queryKey: ['rita-recent-replies', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('messages')
        .select('id, lead_id, content, sender_type, platform, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const missingAvatarIds = (recentSignups ?? [])
      .filter((row) => {
        const linkedLead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
        return row.lead_id && !linkedLead?.profile_picture_url;
      })
      .map((row) => row.lead_id)
      .filter(Boolean);
    if (!missingAvatarIds.length || !ownerId) return;
    void supabase.functions.invoke('fetch-wa-avatars', {
      body: { lead_ids: missingAvatarIds, owner_id: ownerId, limit: missingAvatarIds.length },
    });
  }, [recentSignups, ownerId]);

  return (
    <div className="realtyz-dashboard-scale space-y-6" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">לוח בקרה</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          גיוס מתווכים ל-Realtyz: פרסום, שיחות והרשמות
        </p>
      </div>


      <CollapsibleSection
        id="rita-kpis"
        title="מדדי גיוס"
        description="מתווכים בקשר, הרשמות, שיחות ופרסומים"
        icon={<Users className="h-4 w-4 text-primary" />}
      >
        <div className="grid animate-fade-in grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            icon={Users}
            label="מתווכים בקשר"
            value={brokerContacts ?? 0}
            loading={loadingContacts}
            tooltip="כל המתווכים שנמצאים איתם בקשר במרחב העבודה הזה."
            to="/lead-crm"
          />
          <KpiCard
            icon={UserPlus}
            label="הרשמות בשבוע"
            value={newSignups ?? 0}
            loading={loadingSignups}
            tooltip="בקשות הדגמה והרשמות שהתקבלו בשבעת הימים האחרונים."
            accent="success"
            to="/lead-crm"
          />
          <KpiCard
            icon={MessageCircle}
            label="הודעות היום"
            value={messagesToday ?? 0}
            loading={loadingMessages}
            tooltip="הודעות שנשלחו והתקבלו היום בכל הערוצים."
            accent="warning"
            to="/inbox"
          />
          <KpiCard
            icon={Megaphone}
            label="פרסומים בחודש"
            value={publishedPosts ?? 0}
            loading={loadingPosts}
            tooltip="פוסטים ופרסומים שיצאו בשלושים הימים האחרונים."
            to="/campaigns"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="rita-quick-actions"
        title="פעולות מהירות"
        description="פנייה למתווכים, פרסום תוכן וניהול שיחות"
        icon={<Megaphone className="h-4 w-4 text-primary" />}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button className="h-auto justify-start py-3" variant="outline" onClick={() => navigate('/lead-crm')}>
            <Users className="me-2 h-4 w-4 text-emerald-600" />
            פנייה למתווכים חדשים
          </Button>
          <Button className="h-auto justify-start py-3" variant="outline" onClick={() => navigate('/campaigns')}>
            <Megaphone className="me-2 h-4 w-4 text-orange-500" />
            פרסום פוסט חדש
          </Button>
          <Button className="h-auto justify-start py-3" variant="outline" onClick={() => navigate('/inbox')}>
            <MessageCircle className="me-2 h-4 w-4 text-cyan-600" />
            שיחות פתוחות
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="rita-replies"
        title="תקשורת אחרונה"
        description="הודעות אחרונות בכל הערוצים. הפניות וההדגמות מנוהלות בעמוד המשימות"
        icon={<MessageCircle className="h-4 w-4 text-primary" />}
      >
        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/command-center')}>
            <UserPlus className="me-2 h-4 w-4 text-primary" />
            פניות חדשות והדגמות מתוזמנות
          </Button>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-primary" />
                תקשורת אחרונה
              </CardTitle>
              <CardDescription>הודעות אחרונות בכל הערוצים</CardDescription>
            </CardHeader>
            <CardContent>
              {!recentReplies ? (
                <Skeleton className="h-[220px] w-full" />
              ) : recentReplies.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  אין הודעות חדשות כרגע.
                </p>
              ) : (
                <div className="max-h-[280px] space-y-2 overflow-y-auto pe-1">
                  {recentReplies.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => navigate(row.lead_id ? `/inbox?chat=${row.lead_id}` : '/inbox')}
                      className="flex w-full items-start gap-3 rounded-lg border border-border/40 p-2.5 text-right transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.content || 'הודעה'}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.sender_type === 'ai' ? 'ריטה' : row.sender_type === 'agent' ? 'המשרד' : 'איש קשר'}
                          {row.platform ? ` · ${row.platform}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: he })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  tooltip,
  accent = 'primary',
  to,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading?: boolean;
  tooltip: string;
  accent?: 'primary' | 'success' | 'warning';
  to?: string;
}) {
  const navigate = useNavigate();
  const accentColor = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  }[accent];
  const accentBg = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
  }[accent];

  return (
    <TooltipProvider delayDuration={120}>
      <UiTooltip>
        <Card
          dir="rtl"
          onClick={to ? () => navigate(to) : undefined}
          role={to ? 'button' : undefined}
          tabIndex={to ? 0 : undefined}
          onKeyDown={
            to
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(to);
                  }
                }
              : undefined
          }
          className={`relative overflow-hidden border border-border/80 bg-card shadow-sm ${
            to
              ? 'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              : ''
          }`}
        >
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="מידע על המדד"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <CardContent className="flex flex-col items-center gap-2 px-3 py-4 text-center sm:px-4">
            <div className={`grid h-10 w-10 place-items-center rounded-full ${accentBg}`}>
              <Icon className={`h-5 w-5 ${accentColor}`} />
            </div>
            <p className="text-sm font-medium leading-none text-muted-foreground sm:text-[15px]">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className={`text-2xl font-black tabular-nums sm:text-[28px] ${accentColor}`} dir="ltr">
                {value.toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
        <TooltipContent side="top" align="center">
          <p className="max-w-56 text-center text-xs leading-relaxed">{tooltip}</p>
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

export default RecruitmentDashboard;
