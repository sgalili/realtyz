import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import {
  MessageSquare, Smile, Meh, Frown, Instagram, Send as TelegramIcon,
  Bot, MessageCircle, Wallet, Tag, Home as HomeIcon, Radio, Target, Compass,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import VoterAvatar from '@/components/VoterAvatar';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const loyaltyConfig: Record<string, { label: string; color: string }> = {
  cold: { label: 'מתעניין קר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
  qualified: { label: 'ליד מוסמך', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  touring: { label: 'בסיור נכסים', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  offer_pending: { label: 'ממתין להצעה', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  negotiation: { label: 'במשא ומתן', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  closed: { label: 'סגר עסקה', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  lead: { label: 'מתעניין קר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
  contacted: { label: 'נוצר קשר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
};

const dealTypeMap: Record<string, string> = {
  sale: 'קנייה', rent: 'שכירות', investment: 'השקעה', sell: 'מכירה',
};
const propertyTypeMap: Record<string, string> = {
  apartment: 'דירת מגורים', penthouse: 'פנטהאוז', cottage: "קוטג'",
  office: 'משרד', house: 'בית פרטי', studio: 'סטודיו',
};
const sourceMap: Record<string, string> = {
  facebook_groups: 'פייסבוק קבוצות', facebook: 'פייסבוק',
  whatsapp: 'וואטסאפ', inbound_call: 'שיחה נכנסת',
  yad2: 'יד2', instagram: 'אינסטגרם', website: 'אתר', manual: 'הוזן ידנית',
};

const CircularScore = ({ score, label }: { score: number; label: string }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? 'hsl(var(--success))' : score >= 30 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  return (
    <div className="text-center space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="relative w-24 h-24 mx-auto">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[9px] text-muted-foreground">מתוך 100</span>
        </div>
      </div>
    </div>
  );
};

interface Props {
  voter: {
    id: string;
    full_name: string | null;
    phone_number: string;
    city: string | null;
    neighborhood?: string | null;
    interest_tag: string | null;
    status: string | null;
    lead_stage?: string | null;
    loyalty_tier: string | null;
    engagement_score: number | null;
    sentiment: string | null;
    interest_score_json: any;
    preferences?: any;
    deal_type?: string | null;
    ai_autopilot?: boolean | null;
    instagram_handle?: string | null;
    telegram_username?: string | null;
    profile_picture_url?: string | null;
  };
}

const VoterProfileSidebar = ({ voter }: Props) => {
  const queryClient = useQueryClient();
  const loyalty = loyaltyConfig[voter.lead_stage || voter.loyalty_tier || voter.status || 'lead'] || loyaltyConfig.lead;
  const prefs = (voter.preferences ?? {}) as Record<string, any>;
  const propertyType = prefs.property_type || prefs.listing_type;
  const budget = prefs.budget_max || prefs.monthly_rent_max;
  const budgetLabel = budget
    ? `${Number(budget).toLocaleString('he-IL')} ₪${prefs.monthly_rent_max ? ' / חודש' : ''}`
    : '—';
  const source = prefs.source || prefs.lead_source;
  const area = [voter.city, voter.neighborhood].filter(Boolean).join(' · ') || '—';

  const { data: recentMessages } = useQuery({
    queryKey: ['lead-recent-msgs', voter.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', voter.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Intent score (0-100) derived from inbound replies vs. total messages.
  const inbound = recentMessages?.filter((m: any) => m.direction === 'inbound').length ?? 0;
  const total = recentMessages?.length ?? 0;
  const intentScore = total > 0 ? Math.min(100, Math.round((inbound / Math.max(total, 1)) * 100 * 1.5)) : 0;
  const interactionScore = voter.engagement_score ?? 0;

  const waLink = `https://wa.me/${(voter.phone_number || '').replace(/\D/g, '')}`;

  const cell = (icon: JSX.Element, label: string, value: string) => (
    <div className="p-3 rounded-lg bg-muted/40 space-y-1">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <VoterAvatar fullName={voter.full_name} profilePictureUrl={voter.profile_picture_url} className="h-16 w-16 mx-auto" textClassName="text-lg" />
          <h3 className="text-base font-semibold">{voter.full_name || formatPhoneDisplay(voter.phone_number)}</h3>
          <Badge variant="outline" className={loyalty.color}>{loyalty.label}</Badge>
          <p className="text-xs text-muted-foreground" dir="ltr">{formatPhoneDisplay(voter.phone_number)}</p>
          <a href={waLink} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
            <MessageCircle className="h-3.5 w-3.5" /> פתח בוואטסאפ
          </a>
        </div>

        {/* AI Personal Digital Agent */}
        <div className="rounded-lg border border-primary/30 bg-gradient-to-l from-primary/10 to-transparent p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">סוכן דיגיטלי אישי</p>
              <p className="text-[10px] text-muted-foreground">מנהל קשר, הצעות וסיורים</p>
            </div>
          </div>
          <Switch
            checked={!!voter.ai_autopilot}
            onCheckedChange={async (checked) => {
              const { error } = await supabase
                .from('leads')
                .update({ ai_autopilot: checked } as any)
                .eq('id', voter.id);
              if (error) {
                toast.error('שגיאה בעדכון הסוכן הדיגיטלי');
                return;
              }
              toast.success(checked ? 'הסוכן הדיגיטלי הופעל' : 'הסוכן הדיגיטלי כובה');
              queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
            }}
          />
        </div>

        <Separator />

        {/* Real Estate Closer Grid */}
        <div className="grid grid-cols-2 gap-2">
          {cell(<Tag className="h-3 w-3" />, 'סוג עסקה', voter.deal_type ? (dealTypeMap[voter.deal_type] || voter.deal_type) : '—')}
          {cell(<Radio className="h-3 w-3" />, 'ערוץ הגעה', source ? (sourceMap[source] || source) : '—')}
          {cell(<Wallet className="h-3 w-3" />, 'תקציב מבוקש', budgetLabel)}
          {cell(<Target className="h-3 w-3" />, 'סטטוס לקוח', loyalty.label)}
          {cell(<HomeIcon className="h-3 w-3" />, 'סוג נכס מועדף', propertyType ? (propertyTypeMap[propertyType] || propertyType) : '—')}
          {cell(<Compass className="h-3 w-3" />, 'אזור ביקוש', area)}
        </div>

        <Separator />

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3">
          <CircularScore score={intentScore} label="מדד רצינות לקוח" />
          <CircularScore score={interactionScore} label="אינטראקציות וסיורים" />
        </div>

        {/* Social Handles */}
        {(voter.instagram_handle || voter.telegram_username) && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium mb-2">רשתות חברתיות</p>
              <div className="space-y-2">
                {voter.instagram_handle && (
                  <div className="flex items-center gap-2 text-xs">
                    <Instagram className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                    <span className="text-muted-foreground">@{voter.instagram_handle}</span>
                  </div>
                )}
                {voter.telegram_username && (
                  <div className="flex items-center gap-2 text-xs">
                    <TelegramIcon className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    <span className="text-muted-foreground">@{voter.telegram_username}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Recent Activity */}
        <div>
          <p className="text-xs font-medium mb-2">היסטוריית אינטראקציות אחרונות</p>
          {recentMessages?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">אין הודעות</p>
          )}
          <div className="space-y-2">
            {recentMessages?.map((msg: any) => {
              const label = msg.direction === 'outbound'
                ? 'הצעת נכס נשלחה אוטומטית בוואטסאפ'
                : 'תגובת לקוח התקבלה';
              return (
                <div key={msg.id} className="flex items-start gap-2 text-xs">
                  <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-foreground">{label}</p>
                    <p className="truncate text-muted-foreground">{msg.content}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {msg.created_at ? format(new Date(msg.created_at), 'dd/MM HH:mm') : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default VoterProfileSidebar;
