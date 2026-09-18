// Partner-only "פוסטים" screen: every post the partner published to pages and
// groups, with engagement, Rita's automated first comment and campaign status.
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Heart, MessageSquare, Share2, Eye, Search, Bot, Users, Send, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  PARTNER_CHANNEL_LABELS,
  PARTNER_POST_STATUS_LABELS,
  usePartnerPosts,
  type PartnerPost,
} from '@/hooks/usePartnerSurfaces';

const TABS = [
  { value: 'all', label: 'הכל' },
  { value: 'published', label: 'פורסמו' },
  { value: 'scheduled', label: 'מתוזמנים' },
  { value: 'failed', label: 'נכשלו' },
] as const;

function statusTone(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'failed' || s === 'cancelled') return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
  if (s === 'scheduled' || s === 'pending' || s === 'queued') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
}

function groupCount(groupIds: unknown): number {
  return Array.isArray(groupIds) ? groupIds.length : 0;
}

function fmtDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function Metric({ icon: Icon, value, label, tone }: {
  icon: typeof Heart; value: number; label: string; tone: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-slate-600" title={label}>
      <Icon className={`h-3.5 w-3.5 ${tone}`} />
      {value.toLocaleString('he-IL')}
    </span>
  );
}

function PostCard({ post }: { post: PartnerPost }) {
  const channel = PARTNER_CHANNEL_LABELS[(post.channel || '').toLowerCase()] || post.channel || 'פוסט';
  const status = PARTNER_POST_STATUS_LABELS[(post.status || '').toLowerCase()] || post.status || '';
  const groups = groupCount(post.group_ids);
  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {status && <span className={`rounded-full px-2 py-0.5 text-[12px] ${statusTone(post.status)}`}>{status}</span>}
          <Badge variant="outline" className="text-[12px] font-normal">{channel}</Badge>
          {groups > 0 && (
            <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
              <Users className="h-3.5 w-3.5 text-violet-600" />
              {groups} קבוצות
            </span>
          )}
          <span className="ms-auto text-[12px] text-slate-500">{fmtDate(post.sent_at || post.created_at)}</span>
        </div>

        {post.campaign_name && (
          <p className="text-[14px] font-medium text-slate-800 break-words">{post.campaign_name}</p>
        )}
        {post.message_body && (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700">
            {post.message_body.length > 320 ? `${post.message_body.slice(0, 320)}…` : post.message_body}
          </p>
        )}

        {post.first_comment && (
          <div className="rounded-lg bg-slate-50 p-2 text-[13px] text-slate-700">
            <span className="mb-1 inline-flex items-center gap-1 font-medium text-slate-800">
              <Bot className="h-3.5 w-3.5 text-sky-600" />
              תגובה אוטומטית של ריטה
            </span>
            <p className="whitespace-pre-wrap break-words">{post.first_comment}</p>
          </div>
        )}

        {post.failure_reason && (
          <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[13px] text-rose-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-words">{post.failure_reason}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Metric icon={Heart} value={post.like_count} label="לייקים" tone="text-rose-600" />
          <Metric icon={MessageSquare} value={post.comment_count} label="תגובות" tone="text-sky-600" />
          <Metric icon={Share2} value={post.share_count} label="שיתופים" tone="text-emerald-600" />
          <Metric icon={Eye} value={post.view_count} label="צפיות" tone="text-amber-600" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PartnerPosts() {
  const { data: posts = [], isLoading, refetch, isFetching } = usePartnerPosts();
  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      const s = (p.status || '').toLowerCase();
      if (tab === 'published' && !['sent', 'posted'].includes(s)) return false;
      if (tab === 'scheduled' && !['scheduled', 'pending', 'queued'].includes(s)) return false;
      if (tab === 'failed' && !['failed', 'cancelled'].includes(s)) return false;
      if (!q) return true;
      return `${p.campaign_name ?? ''} ${p.message_body ?? ''} ${p.channel ?? ''}`.toLowerCase().includes(q);
    });
  }, [posts, tab, search]);

  const totals = useMemo(() => posts.reduce(
    (acc, p) => ({
      likes: acc.likes + p.like_count,
      comments: acc.comments + p.comment_count,
      shares: acc.shares + p.share_count,
    }),
    { likes: 0, comments: 0, shares: 0 },
  ), [posts]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3" dir="rtl">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'פוסטים', value: posts.length, tone: 'text-violet-700', bg: 'bg-violet-50' },
          { label: 'תגובות', value: totals.comments, tone: 'text-sky-700', bg: 'bg-sky-50' },
          { label: 'לייקים', value: totals.likes, tone: 'text-rose-700', bg: 'bg-rose-50' },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl ${k.bg} p-3 text-center`}>
            <p className={`text-lg font-semibold ${k.tone}`}>{k.value.toLocaleString('he-IL')}</p>
            <p className="text-[13px] text-slate-600">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש פוסט"
            className="pe-9 text-[14px]"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="רענון">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[13px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Send className="h-6 w-6 text-slate-400" />
            <p className="text-[14px] text-slate-600">אין פוסטים להצגה כרגע.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">{filtered.map((p) => <PostCard key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
