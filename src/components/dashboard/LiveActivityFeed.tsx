import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoMode } from '@/hooks/useDemoMode';
import { UserPlus, Bot, MessageSquare, Send, MapPin, PhoneCall, TrendingUp, MessageCircle, Instagram, Facebook, Music2, type LucideIcon } from 'lucide-react';
import { DEMO_CAMPAIGNS, DEMO_VOTERS } from '@/lib/demoData';
import { useSidebar } from '@/components/ui/sidebar';

const CHANNEL_ICONS = [
  { icon: MessageCircle, color: 'text-social-whatsapp' },
  { icon: Instagram, color: 'text-social-instagram' },
  { icon: Facebook, color: 'text-social-facebook' },
  { icon: Music2, color: 'text-social-tiktok' },
  { icon: Send, color: 'text-social-sms' },
  { icon: PhoneCall, color: 'text-success' },
  { icon: Bot, color: 'text-primary' },
] as const;

const getChannelIcon = (index: number) => CHANNEL_ICONS[(index * 5 + 2) % CHANNEL_ICONS.length];

const GHOST_EVENTS = [
  { icon: PhoneCall, text: 'AI Voice call completed in Haifa', color: 'text-success', path: '/live-conversations' },
  { icon: Send, text: 'WhatsApp campaign reached 5,000 voters', color: 'text-primary', path: '/campaigns' },
  { icon: UserPlus, text: 'New supporter identified in Tel Aviv', color: 'text-success', path: '/voter-crm?city=Tel%20Aviv' },
  { icon: PhoneCall, text: 'שיחת AI Voice הסתיימה עם דני כהן', color: 'text-success', path: '/live-conversations' },
  { icon: UserPlus, text: 'ליד חדש מטיקטוק נכנס למשפך תל אביב', color: 'text-primary', path: '/voter-crm?city=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91' },
  { icon: TrendingUp, text: 'קמפיין WhatsApp הגיע ל-90% קריאה', color: 'text-primary', path: '/campaigns' },
  { icon: UserPlus, text: 'תומכת חדשה מתל אביב', color: 'text-success', path: '/voter-crm?city=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91' },
  { icon: MapPin, text: 'פעילות גבוהה באזור השרון', color: 'text-primary', path: '/sentiment?region=%D7%94%D7%A9%D7%A8%D7%95%D7%9F' },
  { icon: Bot, text: 'AI שכנע בוחר מראשון לציון', color: 'text-primary', path: '/live-conversations' },
  { icon: MessageSquare, text: 'שיחה חדשה נפתחה מנתניה', color: 'text-primary', path: '/live-conversations' },
  { icon: Send, text: '150 הודעות WhatsApp נשלחו', color: 'text-success', path: '/campaigns' },
  { icon: UserPlus, text: 'תומך חדש מבאר שבע', color: 'text-success', path: '/voter-crm?city=%D7%91%D7%90%D7%A8%20%D7%A9%D7%91%D7%A2' },
  { icon: Bot, text: 'AI ענה על שאלה בנושא ביטחון', color: 'text-primary', path: '/live-conversations' },
  { icon: MapPin, text: 'אזור חיפה - 12 פניות חדשות', color: 'text-primary', path: '/sentiment?city=%D7%97%D7%99%D7%A4%D7%94' },
  { icon: MessageSquare, text: 'פידבק חיובי מפתח תקווה', color: 'text-primary', path: '/live-conversations' },
  { icon: Send, text: '500 SMS לקמפיין חינוך', color: 'text-primary', path: '/campaigns' },
  { icon: UserPlus, text: 'תומך חדש מאשדוד', color: 'text-success', path: '/voter-crm?city=%D7%90%D7%A9%D7%93%D7%95%D7%93' },
  { icon: Bot, text: 'AI - סיכום שיחה עם בוחר מהצפון', color: 'text-primary', path: '/live-conversations' },
];

export const buildLiveEvent = (index: number) => {
  const voter = DEMO_VOTERS[index % DEMO_VOTERS.length];
  const campaign = DEMO_CAMPAIGNS[index % DEMO_CAMPAIGNS.length];
  const city = voter.city || 'תל אביב';
  const name = voter.full_name || 'בוחר חדש';
  const sent = 120 + ((index * 37) % 680);

  const channel = getChannelIcon(index);
  const templates = [
    { icon: PhoneCall, text: `שיחת AI הסתיימה עם ${name} · ${city}`, color: 'text-success', path: `/live-conversations?voter=${voter.id}` },
    { icon: PhoneCall, text: `הושלמו ${(4500 + ((index * 73) % 600)).toLocaleString('he-IL')} שיחות קוליות מבוססות AI · ${city}`, color: 'text-success', path: `/campaigns?tab=broadcast` },
    { icon: UserPlus, text: `תומך חדש נכנס למשפך ${city}`, color: 'text-success', path: `/voter-crm?city=${encodeURIComponent(city)}&status=supporter` },
    { icon: Bot, text: `AI סיווג את ${name} לפי עניין: ${voter.interest_tag || 'ביטחון'}`, color: 'text-primary', path: `/voter-crm?voter=${voter.id}` },
    { icon: MessageSquare, text: `שיחה חדשה נפתחה עם ${name}`, color: 'text-primary', path: `/live-conversations?voter=${voter.id}` },
    { icon: Send, text: `${sent.toLocaleString()} הודעות נשלחו בקמפיין ${campaign.name}`, color: 'text-primary', path: `/campaigns?campaign=${campaign.id}` },
    { icon: PhoneCall, text: `קמפיין AI קולי שיגר ${(1200 + ((index * 41) % 800)).toLocaleString('he-IL')} דקות בערוץ הדרום`, color: 'text-primary', path: `/campaigns?tab=broadcast` },
    { icon: MapPin, text: `עלייה חיה במעורבות באזור ${city}`, color: 'text-primary', path: `/sentiment?city=${encodeURIComponent(city)}` },
    { icon: TrendingUp, text: `CTR חיובי זוהה בקמפיין ${campaign.name}`, color: 'text-success', path: `/campaigns?campaign=${campaign.id}` },
  ];

  return { ...templates[index % templates.length], icon: channel.icon, color: channel.color };
};

export interface FeedEvent {
  id: number;
  icon: LucideIcon;
  text: string;
  color: string;
  time: string;
  path: string;
}

export function LiveActivityFeed({ compact = false, floating = false }: { compact?: boolean; floating?: boolean }) {
  const { isDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const counterRef = useRef(0);

  const handleNavigate = (path: string) => {
    if (isMobile) setOpenMobile(false);
    navigate(path);
  };

  useEffect(() => {
    if (!isDemoMode) {
      setEvents([]);
      counterRef.current = 0;
      return;
    }

    const initial: FeedEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const evt = buildLiveEvent(i) ?? GHOST_EVENTS[i % GHOST_EVENTS.length];
      initial.push({
        id: counterRef.current++,
        ...evt,
        time: `לפני ${(4 - i) * 10} שנ׳`,
      });
    }
    setEvents(initial);

    const interval = setInterval(() => {
      const evt = buildLiveEvent(counterRef.current) ?? GHOST_EVENTS[counterRef.current % GHOST_EVENTS.length];
      setEvents(prev => [
        { id: counterRef.current++, ...evt, time: 'עכשיו' },
        ...prev.slice(0, 3),
      ]);
    }, 4_000);

    return () => clearInterval(interval);
  }, [isDemoMode]);

  if (!isDemoMode || events.length === 0) return null;

  return (
    <div className={floating ? 'fixed bottom-5 left-5 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border/60 bg-card p-3 text-card-foreground shadow-lg' : 'space-y-2'} dir="rtl">
      <div className="h-[166px] space-y-1.5 overflow-hidden">
        {(compact ? events.slice(0, 4) : events).map((evt, i) => {
          const Icon = evt.icon;
          return (
            <button
              type="button"
              key={evt.id}
              onClick={() => handleNavigate(evt.path)}
              className={`flex w-full items-center gap-2 text-right text-xs px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/30 transition-all duration-500 hover:bg-primary/5 hover:border-primary/20 active:bg-primary/10 active:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${i === 0 ? 'animate-fade-in' : ''}`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${evt.color}`} />
              <span className="flex-1 truncate text-foreground text-[15px]">{evt.text}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{evt.time}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => handleNavigate('/live-activity')}
        className="mt-3 w-full rounded-md border border-primary/20 bg-background px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        הצג את כל הפעילות
      </button>
    </div>
  );
}
