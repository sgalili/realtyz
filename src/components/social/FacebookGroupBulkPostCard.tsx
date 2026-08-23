import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Users, Send, Loader2, CheckCircle2, XCircle, Search, Eye, MessageCircle, Share2, Sparkles } from 'lucide-react';

type Group = {
  group_id: string;
  group_name: string;
  group_url: string | null;
};

type Metrics = { posts: number; published: number; views: number; comments: number; shares: number };
const ZERO: Metrics = { posts: 0, published: 0, views: 0, comments: 0, shares: 0 };

type Result = { ok: boolean; reason?: string };

/**
 * FacebookGroupBulkPostCard — write one property post (text + image + link)
 * and broadcast it to every selected Facebook group through the official
 * Graph API (fb-group-publish edge function), optionally generating a unique
 * AI variation per group so Facebook's duplicate filters stay quiet.
 */
export const FacebookGroupBulkPostCard = () => {
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [aiVariation, setAiVariation] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});

  const { data: groups, isLoading } = useQuery({
    queryKey: ['custom-user-groups', 'facebook', workspaceOwnerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('custom_user_groups')
        .select('id, group_name, group_url')
        .eq('platform', 'facebook')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        group_id: String(r.id),
        group_name: String(r.group_name || r.group_url || 'קבוצה'),
        group_url: r.group_url ?? null,
      })) as Group[];
    },
  });

  // Per-group historical counters: publication attempts from the activity
  // queue plus aggregated engagement from every campaign log tagged with the
  // group id.
  const { data: metrics } = useQuery({
    queryKey: ['fb-group-metrics', workspaceOwnerId],
    enabled: !!workspaceOwnerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const out: Record<string, Metrics> = {};
      const bump = (id: string) => (out[id] ??= { ...ZERO });

      const [queueRes, logsRes] = await Promise.all([
        (supabase as any)
          .from('campaign_activity_queue')
          .select('target_ref, status, publication_status')
          .eq('workspace_owner_id', workspaceOwnerId)
          .not('target_ref', 'is', null)
          .limit(5000),
        (supabase as any)
          .from('campaign_logs')
          .select('group_ids, view_count, comment_count, share_count')
          .eq('workspace_owner_id', workspaceOwnerId)
          .limit(5000),
      ]);

      for (const r of (queueRes?.data ?? []) as any[]) {
        const m = bump(String(r.target_ref));
        m.posts += 1;
        const ok = String(r.publication_status ?? '') === 'published' || String(r.status ?? '') === 'completed';
        if (ok) m.published += 1;
      }
      for (const r of (logsRes?.data ?? []) as any[]) {
        const ids = Array.isArray(r.group_ids) ? r.group_ids : [];
        for (const raw of ids) {
          const m = bump(String(raw));
          m.views += Number(r.view_count ?? 0) || 0;
          m.comments += Number(r.comment_count ?? 0) || 0;
          m.shares += Number(r.share_count ?? 0) || 0;
        }
      }
      return out;
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = groups ?? [];
    return q ? list.filter((g) => (g.group_name ?? '').includes(q)) : list;
  }, [groups, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /** Ask the AI for a fresh phrasing of the body for one group. */
  const variationFor = async (group: Group, seed: number): Promise<string> => {
    try {
      const { data, error } = await (supabase as any).functions.invoke('spin-group-post', {
        body: { body: message.trim(), group_name: group.group_name, group_url: group.group_url, seed },
      });
      if (error) throw error;
      const draft = String((data as any)?.draft ?? '').trim();
      return draft || message.trim();
    } catch {
      return message.trim();
    }
  };

  const publish = async () => {
    if (!message.trim()) {
      toast.error('יש לכתוב תוכן לפוסט');
      return;
    }
    if (selected.size === 0) {
      toast.error('יש לבחור לפחות קבוצה אחת');
      return;
    }
    setSending(true);
    setResults({});
    let ok = 0;
    let failed = 0;
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i++) {
      const groupId = ids[i];
      const group = (groups ?? []).find((g) => g.group_id === groupId);
      setProgress(`${i + 1}/${ids.length} · ${group?.group_name ?? ''}`);
      try {
        const text = aiVariation && group ? await variationFor(group, i + 1) : message.trim();
        const { data, error } = await supabase.functions.invoke('fb-group-publish', {
          body: {
            group_id: groupId,
            message: text,
            link: link.trim() || undefined,
            image_url: imageUrl.trim() || undefined,
          },
        });
        if (error) throw error;
        const res: any = data;
        if (res?.ok) {
          ok++;
          setResults((p) => ({ ...p, [groupId]: { ok: true } }));
          // Record the publication so the per-group counters and metric
          // sync jobs can pick it up.
          if (workspaceOwnerId) {
            const { data: auth } = await supabase.auth.getUser();
            await (supabase as any).from('campaign_logs').insert({
              user_id: auth?.user?.id ?? workspaceOwnerId,
              workspace_owner_id: workspaceOwnerId,
              campaign_name: `קבוצת פייסבוק · ${group?.group_name ?? groupId}`,
              channel: 'facebook',
              status: 'sent',
              message_body: text,
              group_ids: [groupId],
              provider_message_id: String(res?.post_id ?? ''),
              sent_at: new Date().toISOString(),
            });
          }
        } else {
          failed++;
          setResults((p) => ({ ...p, [groupId]: { ok: false, reason: res?.reason } }));
        }
      } catch (e: any) {
        failed++;
        setResults((p) => ({ ...p, [groupId]: { ok: false, reason: e?.message } }));
      }
    }
    setSending(false);
    setProgress(null);
    if (ok > 0) toast.success(`הפוסט פורסם ב-${ok} קבוצות`, { description: failed ? `${failed} נכשלו` : undefined });
    else toast.error('הפרסום נכשל בכל הקבוצות הנבחרות');
  };

  return (
    <Card className="border-blue-200" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          פרסום מרוכז לקבוצות פייסבוק
        </CardTitle>
        <CardDescription className="text-xs">
          כתיבת פוסט אחד (טקסט, תמונה וקישור לנכס) ושליחתו בו-זמנית לכל הקבוצות שנבחרו
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">תוכן הפוסט</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="דירת 4 חדרים מרווחת בהרצליה..."
            className="text-sm"
          />
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-2.5 py-2 cursor-pointer dark:bg-blue-950/10">
          <Checkbox checked={aiVariation} onCheckedChange={(v) => setAiVariation(v === true)} className="mt-0.5" />
          <span className="text-xs">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" /> AI Text
            </span>
            <span className="block text-[11px] text-muted-foreground">
              יצירת נוסח מעט שונה לכל קבוצה כדי להימנע מסינון תוכן כפול בפייסבוק
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">קישור לנכס (אופציונלי)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://realtyz.co.il/..." className="text-sm" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">כתובת תמונה (אופציונלי)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="text-sm" dir="ltr" />
          </div>
        </div>
        {link.trim() && imageUrl.trim() && (
          <p className="text-[11px] text-amber-700">
            כשקיים קישור, פייסבוק מציג את תצוגת הקישור ולא את התמונה שהועלתה.
          </p>
        )}

        <Separator />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש קבוצה"
              className="h-8 pr-7 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(filtered.map((g) => g.group_id)))}>
            בחר הכל
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            נקה
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען קבוצות...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            לא נמצאו קבוצות מיובאות. יש לחבר פרופיל פייסבוק אישי ולייבא קבוצות.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {filtered.map((g) => {
              const res = results[g.group_id];
              const m = metrics?.[g.group_id] ?? ZERO;
              return (
                <label
                  key={g.group_id}
                  className="flex items-start gap-2 rounded-lg border border-blue-100 bg-white/70 px-2.5 py-2 cursor-pointer dark:bg-background/40"
                >
                  <Checkbox
                    checked={selected.has(g.group_id)}
                    onCheckedChange={() => toggle(g.group_id)}
                    className="mt-0.5"
                  />
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{g.group_name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground" dir="rtl">
                      <span>פוסטים: <span className="font-semibold text-foreground" dir="ltr">{m.posts}</span></span>
                      <span>אושרו: <span className="font-semibold text-emerald-600" dir="ltr">{m.published}</span></span>
                      <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" /><span dir="ltr">{m.views}</span></span>
                      <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" /><span dir="ltr">{m.comments}</span></span>
                      <span className="inline-flex items-center gap-0.5"><Share2 className="h-3 w-3" /><span dir="ltr">{m.shares}</span></span>
                    </span>
                  </span>
                  {m.published > 0 && (
                    <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700">היסטוריה</Badge>
                  )}
                  {res?.ok && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {res && !res.ok && <XCircle className="h-4 w-4 text-red-500" />}
                </label>
              );
            })}
          </div>
        )}

        {Object.values(results).some((r) => !r.ok) && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-1">
            {Object.entries(results)
              .filter(([, r]) => !r.ok)
              .map(([id, r]) => (
                <p key={id} className="text-[11px] text-red-700">
                  {groups?.find((g) => g.group_id === id)?.group_name ?? id}: {r.reason ?? 'פרסום נכשל'}
                </p>
              ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            {progress ? `מפרסם ${progress}` : `${selected.size} קבוצות נבחרו`}
          </span>
          <Button size="sm" onClick={publish} disabled={sending} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            פרסום לקבוצות
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacebookGroupBulkPostCard;
