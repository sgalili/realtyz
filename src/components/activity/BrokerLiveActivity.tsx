import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock, XCircle, MessageCircle, Users, Facebook } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

type Item = { id: string; at: string; icon: typeof Activity; tone: string; text: string };
const PLATFORM: Record<string, string> = { facebook: 'פייסבוק', messenger: 'מסנג׳ר', instagram: 'אינסטגרם', whatsapp: 'וואטסאפ', email: 'אימייל' };
const QUEUE_LABEL: Record<string, string> = { fb_group_post: 'פוסט בקבוצה', fb_page_post: 'פוסט בעמוד העסקי', comment_reply: 'תגובה לפוסט', messenger_send: 'הודעה במסנג׳ר' };

/**
 * Live feed of the broker's own activity: publications to the business page
 * and connected groups, and incoming messages from those channels. Scoped to
 * the active workspace and refreshed every 30 seconds.
 */
export function BrokerLiveActivity({ focus, defaultOpen = true }: { focus: 'chats' | 'campaigns'; defaultOpen?: boolean }) {
  const ws = useActiveWorkspaceOwnerId();
  const [open, setOpen] = useState(defaultOpen);
  const { data = [], isFetching } = useQuery({
    queryKey: ['broker-live-activity', ws, focus],
    enabled: !!ws,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Item[]> => {
      const out: Item[] = [];
      const { data: q } = await (supabase as any).from('campaign_activity_queue')
        .select('id,activity_type,target_label,status,publication_status,updated_at,comments_count,likes_count,last_error')
        .eq('workspace_owner_id', ws).order('updated_at', { ascending: false }).limit(focus === 'campaigns' ? 12 : 5);
      for (const r of q ?? []) {
        const failed = r.status === 'failed' || !!r.last_error;
        const done = ['completed', 'published'].includes(r.status) || r.publication_status === 'published';
        const what = QUEUE_LABEL[r.activity_type] ?? 'פעולת קמפיין';
        const stats = done && (r.comments_count || r.likes_count) ? ` · ${r.likes_count ?? 0} לייקים · ${r.comments_count ?? 0} תגובות` : '';
        out.push({ id: `q:${r.id}`, at: r.updated_at, icon: failed ? XCircle : done ? CheckCircle2 : Clock, tone: failed ? 'text-destructive' : done ? 'text-success' : 'text-muted-foreground',
          text: `${what}${r.target_label ? ` ב${r.target_label}` : ''}: ${failed ? 'נכשל' : done ? 'פורסם' : 'בתור'}${stats}` });
      }
      const { data: m } = await (supabase as any).from('messages')
        .select('id,platform,content,created_at,leads!inner(full_name,workspace_owner_id)')
        .eq('leads.workspace_owner_id', ws).eq('direction', 'inbound').in('platform', ['facebook', 'messenger', 'instagram', 'whatsapp'])
        .order('created_at', { ascending: false }).limit(focus === 'chats' ? 12 : 5);
      for (const r of m ?? []) {
        out.push({ id: `m:${r.id}`, at: r.created_at, icon: r.platform === 'whatsapp' ? MessageCircle : r.platform === 'facebook' ? Facebook : Users, tone: 'text-primary',
          text: `${r.leads?.full_name || 'פונה'} ב${PLATFORM[r.platform] ?? r.platform}: ${String(r.content ?? '').slice(0, 70)}` });
      }
      return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
    },
  });
  return (
    <section dir="rtl" aria-label="פעילות חיה" className="mb-3 rounded-xl border border-border bg-card p-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-start text-sm font-semibold">
        <Activity className={`h-4 w-4 text-success ${isFetching ? 'animate-pulse' : ''}`} />פעילות חיה בעמוד העסקי, בקבוצות ובחשבון
        {!open && data.length > 0 && <span className="ms-auto rounded-full bg-muted px-2 text-xs tabular-nums">{data.length}</span>}
      </button>
      {!open ? null : data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">עדיין אין פעילות להצגה</p> : (
        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
          {data.map(({ id, at, icon: Icon, tone, text }) => (
            <li key={id} className="flex items-start gap-2 text-sm">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
              <span className="min-w-0 flex-1 break-words">{text}</span>
              <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
