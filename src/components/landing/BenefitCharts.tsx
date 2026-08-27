import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/* Realtyz landing — visual proof charts. Navy + gold brand palette only. */

const NAVY = 'hsl(var(--brand-navy))';
const GOLD = 'hsl(var(--brand-gold))';

const RESPONSE = [
  { label: 'ידני', minutes: 240 },
  { label: 'עם Realtyz', minutes: 1 },
];

const PIPELINE = [
  { month: 'ינו', leads: 42, deals: 3 },
  { month: 'פבר', leads: 68, deals: 5 },
  { month: 'מרץ', leads: 96, deals: 8 },
  { month: 'אפר', leads: 134, deals: 12 },
  { month: 'מאי', leads: 178, deals: 17 },
  { month: 'יונ', leads: 231, deals: 24 },
];

const CHANNEL_MIX = [
  { channel: 'ווטסאפ', value: 46 },
  { channel: 'פייסבוק', value: 22 },
  { channel: 'אינסטגרם', value: 14 },
  { channel: 'אימייל', value: 11 },
  { channel: 'SMS', value: 7 },
];

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 12 };
const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  color: 'hsl(var(--card-foreground))',
  fontSize: 13,
  direction: 'rtl' as const,
};

function Frame({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="landing-card rounded-2xl border border-border/70 bg-card p-5">
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>
      <div className="mt-4 h-56 w-full" dir="ltr">{children}</div>
    </div>
  );
}

export function BenefitCharts() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Frame title="זמן תגובה לליד חדש" note="דקות מרגע הפנייה ועד המענה הראשון">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={RESPONSE} barSize={54}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} {...axis} />
            <YAxis tickLine={false} axisLine={false} {...axis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} דקות`, 'זמן תגובה']} />
            <Bar dataKey="minutes" radius={[8, 8, 0, 0]}>
              {RESPONSE.map((r, i) => (
                <Cell key={r.label} fill={i === 0 ? 'hsl(var(--border))' : GOLD} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Frame>

      <Frame title="צמיחת פייפ העסקאות" note="לידים מנוהלים ועסקאות שנסגרו לפי חודש">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={PIPELINE}>
            <defs>
              <linearGradient id="rz-leads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NAVY} stopOpacity={0.35} />
                <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} {...axis} />
            <YAxis tickLine={false} axisLine={false} {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
            <Area name="לידים" type="monotone" dataKey="leads" stroke={NAVY} strokeWidth={2.5} fill="url(#rz-leads)" />
            <Line name="עסקאות" type="monotone" dataKey="deals" stroke={GOLD} strokeWidth={3} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Frame>

      <Frame title="פילוח שיחות לפי ערוץ" note="הכל נכנס לתיבה אחת מסונכרנת (%)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={CHANNEL_MIX} layout="vertical" barSize={18}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} {...axis} />
            <YAxis type="category" dataKey="channel" width={72} tickLine={false} axisLine={false} {...axis} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, 'נפח']} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {CHANNEL_MIX.map((c, i) => (
                <Cell key={c.channel} fill={i === 0 ? GOLD : NAVY} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Frame>
    </div>
  );
}

export default BenefitCharts;
