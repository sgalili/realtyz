import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { MessageSquare, Smile, Meh, Frown, Instagram, Send as TelegramIcon } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import VoterAvatar from '@/components/VoterAvatar';

const radarAxisLabels: Record<string, string> = {
  security: 'ביטחון', economy: 'כלכלה', judicial: 'משפט', social: 'חברה', governance: 'ממשל',
};

const loyaltyConfig: Record<string, { label: string; color: string }> = {
  supporter: { label: 'תומך', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-300' },
  active: { label: 'פעיל', color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  lead: { label: 'מתלבט', color: 'bg-amber-500/15 text-amber-700 border-amber-300' },
  inactive: { label: 'מתנגד', color: 'bg-red-500/15 text-red-700 border-red-300' },
  contacted: { label: 'נוצר קשר', color: 'bg-slate-500/15 text-slate-700 border-slate-300' },
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

const CircularScore = ({ score }: { score: number }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? 'hsl(var(--success))' : score >= 30 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  return (
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
  );
};

const SentimentIcon = ({ sentiment }: { sentiment: string | null }) => {
  if (sentiment === 'positive') return <Smile className="h-5 w-5 text-emerald-500" />;
  if (sentiment === 'negative') return <Frown className="h-5 w-5 text-red-500" />;
  return <Meh className="h-5 w-5 text-amber-500" />;
};

interface Props {
  voter: {
    id: string;
    full_name: string | null;
    phone_number: string;
    city: string | null;
    interest_tag: string | null;
    status: string | null;
    loyalty_tier: string | null;
    engagement_score: number | null;
    sentiment: string | null;
    interest_score_json: any;
    instagram_handle?: string | null;
    telegram_username?: string | null;
    profile_picture_url?: string | null;
  };
}

const VoterProfileSidebar = ({ voter }: Props) => {
  const scores = voter.interest_score_json || { security: 0, economy: 0, judicial: 0, social: 0, governance: 0 };
  const radarData = Object.entries(radarAxisLabels).map(([key, label]) => ({
    subject: label,
    value: (scores as Record<string, number>)[key] || 0,
    fullMark: 100,
  }));

  const loyalty = loyaltyConfig[voter.loyalty_tier || voter.status || 'lead'] || loyaltyConfig.lead;

  const { data: recentMessages } = useQuery({
    queryKey: ['voter-recent-msgs', voter.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('voter_id', voter.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Avatar & Name */}
        <div className="text-center space-y-2">
          <VoterAvatar fullName={voter.full_name} profilePictureUrl={voter.profile_picture_url} className="h-16 w-16 mx-auto" textClassName="text-lg" />
          <h3 className="text-base font-semibold">{voter.full_name || formatPhoneDisplay(voter.phone_number)}</h3>
          <Badge variant="outline" className={loyalty.color}>{loyalty.label}</Badge>
          <p className="text-xs text-muted-foreground">{voter.city} · {formatPhoneDisplay(voter.phone_number)}</p>
        </div>

        <Separator />

        {/* Engagement & Sentiment */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">ציון מעורבות</p>
            <CircularScore score={voter.engagement_score || 0} />
          </div>
          <div className="text-center flex flex-col items-center justify-center">
            <p className="text-[10px] text-muted-foreground mb-1">סנטימנט</p>
            <SentimentIcon sentiment={voter.sentiment} />
            <span className="text-xs mt-1">
              {voter.sentiment === 'positive' ? 'חיובי' : voter.sentiment === 'negative' ? 'שלילי' : 'ניטרלי'}
            </span>
          </div>
        </div>

        <Separator />

        {/* Radar Chart */}
        <div>
          <p className="text-xs font-medium mb-2 text-center">מכ״ם אינטרסים</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="עניין" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Separator />

        {/* Social Handles */}
        {(voter.instagram_handle || voter.telegram_username) && (
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
        )}

        <Separator />

        {/* Recent Messages */}
        <div>
          <p className="text-xs font-medium mb-2">היסטוריית אינטראקציות אחרונות</p>
          {recentMessages?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">אין הודעות</p>
          )}
          <div className="space-y-2">
            {recentMessages?.map((msg) => (
              <div key={msg.id} className="flex items-start gap-2 text-xs">
                <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">{msg.content}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {msg.created_at ? format(new Date(msg.created_at), 'dd/MM HH:mm') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default VoterProfileSidebar;
