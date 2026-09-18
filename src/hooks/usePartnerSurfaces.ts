// Partner-only ("שותף") data layer for the dedicated Posts / Chats / Contacts
// screens. Affiliates never touch workspace tables directly: every read goes
// through a security-definer RPC scoped to `auth.uid()`, so a partner only ever
// sees their own posts, their own conversations and the contacts they submitted.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Typed RPC escape hatch: these functions are partner-scoped helpers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args);

export type PartnerPost = {
  id: string;
  campaign_name: string | null;
  channel: string | null;
  status: string | null;
  message_body: string | null;
  media_urls: unknown;
  group_ids: unknown;
  listing_id: string | null;
  first_comment: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  failure_reason: string | null;
  created_at: string;
  sent_at: string | null;
};

export type PartnerChat = {
  lead_id: string;
  full_name: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
  city: string | null;
  ai_autopilot: boolean;
  last_message: string | null;
  last_message_at: string | null;
  last_direction: string | null;
  last_channel: string | null;
  message_count: number;
};

export type PartnerChatMessage = {
  id: string;
  direction: string | null;
  sender_type: string | null;
  content: string | null;
  channel: string | null;
  platform: string | null;
  ai_assisted: boolean;
  created_at: string;
};

export type PartnerContact = {
  lead_id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  city: string | null;
  neighborhood: string | null;
  deal_type: string | null;
  lead_stage: string | null;
  status: string | null;
  profile_picture_url: string | null;
  last_interaction_at: string | null;
  created_at: string;
  submission_status: string | null;
  earned_amount: number | null;
  settlement_status: string | null;
  listing_id: string | null;
  message_count: number;
};

export const PARTNER_POST_STATUS_LABELS: Record<string, string> = {
  sent: 'פורסם',
  posted: 'פורסם',
  scheduled: 'מתוזמן',
  pending: 'ממתין',
  queued: 'בתור',
  failed: 'נכשל',
  draft: 'טיוטה',
  cancelled: 'בוטל',
};

export const PARTNER_CHANNEL_LABELS: Record<string, string> = {
  facebook: 'עמוד פייסבוק',
  facebook_group: 'קבוצת פייסבוק',
  fb_group_post: 'קבוצת פייסבוק',
  instagram: 'אינסטגרם',
  whatsapp: 'וואטסאפ',
  sms: 'SMS',
  email: 'אימייל',
  linkedin: 'לינקדאין',
};

export function usePartnerPosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['partner-posts', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await rpc('get_affiliate_posts');
      if (error) throw error;
      return (data ?? []) as PartnerPost[];
    },
  });
}

export function usePartnerChats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['partner-chats', user?.id],
    enabled: !!user?.id,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await rpc('get_affiliate_chats');
      if (error) throw error;
      return (data ?? []) as PartnerChat[];
    },
  });
}

export function usePartnerChatMessages(leadId: string | null) {
  return useQuery({
    queryKey: ['partner-chat-messages', leadId],
    enabled: !!leadId,
    refetchInterval: leadId ? 10000 : false,
    queryFn: async () => {
      const { data, error } = await rpc('get_affiliate_chat_messages', { p_lead_id: leadId });
      if (error) throw error;
      return (data ?? []) as PartnerChatMessage[];
    },
  });
}

export function usePartnerContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['partner-contacts', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await rpc('get_affiliate_contacts');
      if (error) throw error;
      return (data ?? []) as PartnerContact[];
    },
  });
}

/** Refresh every partner surface after an action that can change the data. */
export function useRefreshPartnerSurfaces() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['partner-posts'] });
    qc.invalidateQueries({ queryKey: ['partner-chats'] });
    qc.invalidateQueries({ queryKey: ['partner-chat-messages'] });
    qc.invalidateQueries({ queryKey: ['partner-contacts'] });
  };
}

/** Partner sends a message on the contact's existing channel. */
export function usePartnerSendMessage() {
  const refresh = useRefreshPartnerSurfaces();
  return useMutation({
    mutationFn: async ({
      leadId,
      content,
      channel,
    }: { leadId: string; content: string; channel?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: { lead_id: leadId, content, channel: channel || 'whatsapp' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refresh(),
  });
}
