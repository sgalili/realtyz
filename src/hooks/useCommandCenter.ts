import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type CommandTask = {
  id: string;
  source: 'task' | 'meeting' | 'note';
  title: string;
  description: string | null;
  priority: 'high' | 'medium' | 'low';
  status: string;
  dueAt: string | null;
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
  listingId: string | null;
  listingLabel: string | null;
  actionType: string | null;
};

const PRIORITY_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 };

const CLOSED_TASK_STATUSES = new Set(['completed', 'done', 'cancelled', 'sent', 'archived']);

export const ACTION_TYPE_LABEL: Record<string, string> = {
  follow_up: 'מעקב',
  property_search: 'איתור נכס',
  property_matching: 'התאמת נכסים',
  status_check: 'בדיקת סטטוס',
  marketing_followup: 'מעקב שיווקי',
  business_collaboration: 'שיתוף פעולה',
  call: 'שיחת טלפון',
  meeting: 'פגישה',
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  open: 'פתוח',
  on_hold: 'בהמתנה',
  waiting_for_response: 'ממתין לתשובת לקוח',
  pending: 'ממתין',
  scheduled: 'מתוזמן',
};

export const NOTE_ACTION_LABEL: Record<string, string> = {
  note: 'פתק',
  interaction: 'סיכום שיחה',
};

export function useCommandCenterTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['command-center-tasks', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<CommandTask[]> => {
      const [itemsRes, meetingsRes, notesRes] = await Promise.all([
        (supabase as any)
          .from('scheduled_items')
          .select('id, title, content, item_type, status, scheduled_for, metadata')
          .order('scheduled_for', { ascending: true })
          .limit(300),
        (supabase as any)
          .from('meetings')
          .select('id, title, description, starts_at, status, lead_id, lead_name, lead_phone')
          .gte('starts_at', new Date(Date.now() - 12 * 3600_000).toISOString())
          .order('starts_at', { ascending: true })
          .limit(100),
        (supabase as any)
          .from('interaction_activity_log')
          .select('id, action_type, platform, content, metadata, created_at')
          .in('action_type', ['note', 'interaction'])
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      const rawItems: any[] = Array.isArray(itemsRes?.data) ? itemsRes.data : [];
      const POST_TYPES = new Set(['social_post', 'sms_campaign', 'whatsapp_blast', 'push']);
      const items = rawItems.filter(
        (r) => !CLOSED_TASK_STATUSES.has(String(r.status ?? '').toLowerCase())
          && !POST_TYPES.has(String(r.item_type ?? '').toLowerCase()),

      );

      const leadIds = new Set<string>();
      const listingIds = new Set<string>();
      for (const r of items) {
        const m = (r.metadata ?? {}) as any;
        if (m.lead_id) leadIds.add(m.lead_id);
        if (m.listing_id) listingIds.add(m.listing_id);
      }
      const meetings: any[] = Array.isArray(meetingsRes?.data)
        ? meetingsRes.data.filter((m: any) => String(m.status ?? '').toLowerCase() !== 'cancelled')
        : [];
      for (const m of meetings) if (m.lead_id) leadIds.add(m.lead_id);

      const [leadsRes, listingsRes] = await Promise.all([
        leadIds.size
          ? (supabase as any)
              .from('leads')
              .select('id, full_name, phone_number')
              .in('id', Array.from(leadIds))
          : Promise.resolve({ data: [] }),
        listingIds.size
          ? (supabase as any)
              .from('listings')
              .select('id, property_title, address, city')
              .in('id', Array.from(listingIds))
          : Promise.resolve({ data: [] }),
      ]);

      const leadMap = new Map<string, any>(
        (leadsRes?.data ?? []).map((l: any) => [l.id, l]),
      );
      const listingMap = new Map<string, any>(
        (listingsRes?.data ?? []).map((l: any) => [l.id, l]),
      );

      const tasks: CommandTask[] = items.map((r) => {
        const m = (r.metadata ?? {}) as any;
        const followup = (m.crm_followup ?? {}) as any;
        const lead = m.lead_id ? leadMap.get(m.lead_id) : null;
        const listing = m.listing_id ? listingMap.get(m.listing_id) : null;
        const rawPriority = String(m.priority ?? followup.priority ?? 'medium').toLowerCase();
        return {
          id: r.id,
          source: 'task',
          title: lead?.full_name
            ? `${ACTION_TYPE_LABEL[followup.action_type] ?? 'משימה'} · ${lead.full_name}`
            : String(r.title ?? 'משימה'),
          description: followup.description ?? r.content ?? null,
          priority: (PRIORITY_WEIGHT[rawPriority] !== undefined ? rawPriority : 'medium') as CommandTask['priority'],
          status: String(r.status ?? 'open'),
          dueAt: followup.due_at ?? r.scheduled_for ?? null,
          leadId: m.lead_id ?? null,
          leadName: lead?.full_name ?? null,
          leadPhone: lead?.phone_number ?? null,
          listingId: m.listing_id ?? null,
          listingLabel: listing
            ? listing.property_title || [listing.address, listing.city].filter(Boolean).join(', ') || 'נכס'
            : null,
          actionType: followup.action_type ?? null,
        };
      });

      for (const mt of meetings) {
        const lead = mt.lead_id ? leadMap.get(mt.lead_id) : null;
        tasks.push({
          id: mt.id,
          source: 'meeting',
          title: mt.title || `פגישה · ${lead?.full_name ?? mt.lead_name ?? 'לקוח'}`,
          description: mt.description ?? null,
          priority: 'high',
          status: String(mt.status ?? 'scheduled'),
          dueAt: mt.starts_at ?? null,
          leadId: mt.lead_id ?? null,
          leadName: lead?.full_name ?? mt.lead_name ?? null,
          leadPhone: lead?.phone_number ?? mt.lead_phone ?? null,
          listingId: null,
          listingLabel: null,
          actionType: 'meeting',
        });
      }

      tasks.sort((a, b) => {
        const now = Date.now();
        const aOver = a.dueAt ? new Date(a.dueAt).getTime() < now : false;
        const bOver = b.dueAt ? new Date(b.dueAt).getTime() < now : false;
        if (aOver !== bOver) return aOver ? -1 : 1;
        const pa = PRIORITY_WEIGHT[a.priority] ?? 1;
        const pb = PRIORITY_WEIGHT[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return da - db;
      });

      return tasks;
    },
  });
}

export type CommandMetrics = {
  activeLeads: number;
  marketedListings: number;
  awaitingClientReply: number;
};

export function useCommandCenterMetrics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['command-center-metrics', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<CommandMetrics> => {
      const activeLeads = async () => {
        const { count } = await (supabase as any)
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .not('interaction_outcome', 'in', '("won","lost","ghosted")');
        return count ?? 0;
      };

      const marketedListings = async () => {
        const { count } = await (supabase as any)
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'live');
        return count ?? 0;
      };

      // Awaiting client reply = leads whose most recent message came from us.
      const awaitingClientReply = async () => {
        const { data } = await (supabase as any)
          .from('messages')
          .select('lead_id, sender_type, created_at')
          .not('lead_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2000);
        if (!Array.isArray(data)) return 0;
        const latest = new Map<string, string>();
        for (const row of data) {
          if (!latest.has(row.lead_id)) latest.set(row.lead_id, row.sender_type);
        }
        let n = 0;
        latest.forEach((sender) => {
          if (sender === 'agent' || sender === 'ai') n += 1;
        });
        return n;
      };

      const [a, b, c] = await Promise.all([
        activeLeads().catch(() => 0),
        marketedListings().catch(() => 0),
        awaitingClientReply().catch(() => 0),
      ]);
      return { activeLeads: a, marketedListings: b, awaitingClientReply: c };
    },
  });
}

/* ───────── Posts & publishing activity (published + scheduled) ───────── */

export const POST_ITEM_TYPES = ['social_post', 'sms_campaign', 'whatsapp_blast', 'push'] as const;

export type PostActivity = {
  id: string;
  title: string;
  content: string | null;
  channel: string | null;
  status: string;
  when: string | null;
  scheduled: boolean;
  source: 'scheduled_item' | 'queue';
};

export const POST_STATUS_LABEL: Record<string, string> = {
  posted: 'פורסם',
  sent: 'נשלח',
  published: 'פורסם',
  completed: 'הושלם',
  in_progress: 'בפרסום',
  approved: 'מאושר לתזמון',
  scheduled: 'מתוזמן',
  pending: 'ממתין לפרסום',
  draft: 'טיוטה',
  failed: 'נכשל',
  error: 'נכשל',
};

export const CHANNEL_LABEL: Record<string, string> = {
  facebook: 'פייסבוק',
  instagram: 'אינסטגרם',
  whatsapp: 'וואטסאפ',
  sms: 'SMS',
  email: 'אימייל',
  push: 'התראה',
};

export function useCommandCenterPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['command-center-posts', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<PostActivity[]> => {
      const [itemsRes, queueRes] = await Promise.all([
        (supabase as any)
          .from('scheduled_items')
          .select('id, title, content, item_type, channel, status, scheduled_for')
          .in('item_type', POST_ITEM_TYPES as unknown as string[])
          .order('scheduled_for', { ascending: false })
          .limit(60),
        (supabase as any)
          .from('campaign_activity_queue')
          .select('id, activity_type, target_label, status, scheduled_for, payload')
          .order('scheduled_for', { ascending: false })
          .limit(40),
      ]);

      const out: PostActivity[] = [];
      const now = Date.now();

      for (const r of (Array.isArray(itemsRes?.data) ? itemsRes.data : [])) {
        const when = r.scheduled_for ?? null;
        out.push({
          id: `si-${r.id}`,
          title: String(r.title || 'פוסט'),
          content: r.content ?? null,
          channel: r.channel ?? null,
          status: String(r.status ?? 'draft'),
          when,
          scheduled: !!when && new Date(when).getTime() > now,
          source: 'scheduled_item',
        });
      }

      for (const q of (Array.isArray(queueRes?.data) ? queueRes.data : [])) {
        const when = q.scheduled_for ?? null;
        const payload = (q.payload ?? {}) as any;
        out.push({
          id: `q-${q.id}`,
          title: q.target_label || payload.title || 'פרסום לקבוצה',
          content: payload.body ?? null,
          channel: String(q.activity_type ?? '').startsWith('fb') ? 'facebook' : null,
          status: String(q.status ?? 'pending'),
          when,
          scheduled: !!when && new Date(when).getTime() > now,
          source: 'queue',
        });
      }

      out.sort((a, b) => {
        if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
        const ta = a.when ? new Date(a.when).getTime() : 0;
        const tb = b.when ? new Date(b.when).getTime() : 0;
        return a.scheduled ? ta - tb : tb - ta;
      });

      return out.slice(0, 40);
    },
  });
}
