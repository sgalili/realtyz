import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, ClipboardList, Coins, Eye, Handshake, Home, Link2, List, Megaphone, MessageCircle, Search, Send, Users } from 'lucide-react';
import { PublicProfileShell } from '@/components/public/PublicProfileShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DemoCampaignHistory, usePublicDemoProperties, useSimulationTick } from '@/components/demo/DemoCampaignHistory';
import { DEMO_CONFIGS, DEMO_TYPES, isDemoType, RITA_CHAT } from './demoData';

const sections = [
  ['activity', 'פעילות', Eye], ['campaigns', 'קמפיינים', Megaphone], ['properties', 'נכסים', Home], ['projects', 'פרויקטים', Building2],
  ['leads', 'לידים', Users], ['rita', 'ריטה', MessageCircle], ['community', 'קהילה', Users], ['tasks', 'מטלות', ClipboardList],
  ['deals', 'עסקאות', Handshake], ['wallet', 'קרדיטים ותגמולים', Coins], ['connections', 'חיבורים', Link2], ['profile', 'פרופיל', List],
] as const;
const leads = [ ['נועה ל.', 'רמת גן', 'קנייה', 'מסונן'], ['איתי מ.', 'הרצליה', 'שכירות', 'ביקור נקבע'], ['מיכל ש.', 'רעננה', 'קנייה', 'חדש'], ['דניאל כ.', 'בת ים', 'קנייה', 'מתקדם'] ];
const money = (value: number) => `₪${value.toLocaleString('he-IL')}`;

/** Local simulation only: no auth switching, write handlers, private inventory or real lead identities. */
export default function PublicDemo() {
  const { type } = useParams();
  const navigate = useNavigate();
  const role = isDemoType(type) ? type : null;
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.closest('.realtyz-main-surface')?.scrollTo({ top: 0 }); }, [type]);
  const [section, setSection] = useState('activity');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(RITA_CHAT.slice(0, 4));
  const properties = usePublicDemoProperties();
  const tick = useSimulationTick();
  const config = role ? DEMO_CONFIGS[role] : null;
  const selectRole = (next: string) => { if (isDemoType(next)) { setSection('activity'); setExpanded(null); setSearch(''); navigate(`/demo/${next}`); } };
  const converse = () => {
    if (!draft.trim()) return;
    const text = draft.trim(); setDraft('');
    setMessages(value => [...value, { from: 'lead', text }, { from: 'rita', text: /תקציב|מחיר/.test(text) ? `בדוגמה שלנו יש ${properties[0].rooms} חדרים ב${properties[0].city}, במחיר ${money(properties[0].price)}. מה חשוב לך בנכס?` : /סיור|ביקור/.test(text) ? 'אפשר להדגים תיאום ביקור ביום חמישי ב־17:00. מה התקציב שלך וכמה חדרים נדרשים?' : 'אני ריטה. אעזור לסנן את הפנייה ולהתאים נכס. באיזו עיר מחפשים, ומה טווח התקציב?' }]);
  };
  return <PublicProfileShell><main ref={mainRef} dir="rtl" className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div><h1 className="text-2xl font-bold">TORAFF · מרחב הדגמה</h1><p className="mt-1 text-sm text-muted-foreground">סימולציה · ללא הרשמה · ללא שינוי נתונים אמיתיים</p></div>
      <div className="flex items-center gap-2"><Button variant="ghost" size="icon" title="חזרה ללוח" aria-label="חזרה ללוח" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button><Button onClick={() => navigate('/auth')}>הרשמה חינם</Button></div>
    </header>
    {!role || !config ? <section className="py-6"><h2 className="mb-4 text-lg font-semibold">בחירת סוג משתמש</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{DEMO_TYPES.map(item => <Button key={item.id} variant="outline" className="h-20 justify-between text-base" onClick={() => selectRole(item.id)}>{item.label}<Eye className="h-5 w-5 text-primary" /></Button>)}</div></section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4"><h2 className="text-lg font-semibold">{config.headline}</h2><Select value={role} onValueChange={selectRole}><SelectTrigger className="w-52" aria-label="סוג משתמש בהדגמה"><SelectValue /></SelectTrigger><SelectContent dir="rtl">{DEMO_TYPES.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <nav aria-label="מודולים בהדגמה" className="mb-5 flex flex-wrap gap-1 border-b border-border pb-3">{sections.map(([id, label, Icon]) => <Button key={id} variant={section === id ? 'secondary' : 'ghost'} className="gap-2 px-3 text-sm" aria-pressed={section === id} onClick={() => { setSection(id); setSearch(''); setExpanded(null); }}><Icon className="h-4 w-4" />{label}</Button>)}</nav>
      {section === 'activity' && <section className="space-y-6"><div className="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-border pb-6 lg:grid-cols-4">{config.stats.map(stat => <div key={stat.label}><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{Math.floor(stat.base + tick * stat.perTick).toLocaleString('he-IL')}{stat.suffix && ` ${stat.suffix}`}</p></div>)}</div><h3 className="text-lg font-semibold">פעילות אחרונה</h3>{['ריטה סיננה פנייה חדשה ומצאה התאמה לנכס', 'פוסט חדש פורסם בקבוצת נדל״ן מקומית', 'שותף נוסף הצטרף לשיווק נכס', 'ביקור בנכס נקבע ליום חמישי'].map((text, index) => <div key={text} className="flex items-center gap-3 border-b border-border py-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" /><p className="flex-1">{text}</p><span className="text-xs text-muted-foreground">לפני {index * 3 + 1} דקות</span></div>)}</section>}
      {section === 'campaigns' && <DemoCampaignHistory properties={properties} />}
      {(section === 'properties' || section === 'projects') && <section><div className="relative mb-4 max-w-sm"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="חיפוש נכסים בהדגמה" className="ps-9" placeholder="חיפוש לפי עיר" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{properties.filter(property => property.city.includes(search)).map(property => <article key={property.id} className="overflow-hidden rounded-lg border border-border bg-card">{property.photo && <img src={property.photo} alt={`נכס ציבורי ב${property.city}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />}<Button variant="ghost" className="h-auto w-full flex-col items-start gap-2 whitespace-normal p-4 text-right" aria-expanded={expanded === property.id} onClick={() => setExpanded(expanded === property.id ? null : property.id)}><span className="font-semibold">{section === 'projects' ? 'פרויקט הגנים · ' : `${property.rooms} חדרים · `}{property.city}</span><span>{money(property.price)}{property.rent && ' לחודש'}</span><span className="text-sm text-muted-foreground">{property.fromBoard ? 'בהשראת נכס ציבורי · פרטים הותאמו' : 'נכס לדוגמה'}</span></Button>{expanded === property.id && <div className="space-y-2 border-t border-border p-4 text-sm"><p>{property.street} · {property.sqm} מ״ר</p><p>טופס {money(property.rewards[0])} · WhatsApp {money(property.rewards[1])}</p><p>שיחה {money(property.rewards[2])} · סגירה {money(property.rewards[3])}</p><p className="text-muted-foreground">תגמולים מדומים להמחשה בלבד</p></div>}</article>)}</div></section>}
      {section === 'leads' && <section className="overflow-x-auto"><table className="w-full text-right"><thead><tr className="border-b border-border">{['שם', 'עיר', 'סוג ליד', 'שלב'].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{leads.map(row => <tr key={row[0]} className="border-b border-border">{row.map(cell => <td key={cell} className="px-3 py-4">{cell}</td>)}</tr>)}</tbody></table></section>}
      {section === 'rita' && <section className="mx-auto max-w-2xl"><div className="space-y-4">{messages.map((message, index) => <div key={index} className={`max-w-[90%] rounded-lg p-3 ${message.from === 'rita' ? 'me-auto bg-primary/10' : 'ms-auto bg-muted'}`}><p className="mb-1 text-xs font-semibold text-muted-foreground">{message.from === 'rita' ? 'ריטה · הדגמה' : 'מבקר · הדגמה'}</p><p>{message.text}</p></div>)}</div><form className="mt-5 flex gap-2" onSubmit={event => { event.preventDefault(); converse(); }}><Input aria-label="הודעה לריטה בהדגמה" placeholder="הודעה לריטה" value={draft} onChange={event => setDraft(event.target.value)} /><Button type="submit" size="icon" aria-label="שליחת הודעת הדגמה" disabled={!draft.trim()}><Send className="h-4 w-4" /></Button></form></section>}
      {section === 'tasks' && <section>{['בדיקת פנייה חדשה ברמת גן', 'המשך שיחה לאחר ביקור בנכס', 'בחינת פרטי טיוטת נכס', 'תיאום ביקור עם מתעניין'].map((task, index) => <div key={task} className="flex items-center gap-3 border-b border-border py-4"><ClipboardList className="h-5 w-5 text-primary" /><p className="flex-1">{task}</p><span className="text-sm text-muted-foreground">{index < 2 ? 'היום' : 'מחר'}</span></div>)}</section>}
      {section === 'community' && <section className="space-y-4">{['שיתופי פעולה באזור המרכז', 'שותפים לשיווק פרויקטים', 'נדל״ן השרון'].map((group, index) => <div key={group} className="border-b border-border py-4"><h3 className="font-semibold">{group}</h3><p className="my-2 text-sm text-muted-foreground">{86 + index * 27} חברים · פעילות מדומה</p><p>דנה: יש לנו מתעניינים שמחפשים 4 חדרים באזור. נשמח לבדוק התאמות.</p><p className="mt-2 text-primary">ריטה: מצאתי נכסים לדוגמה שיכולים להתאים. אפשר לבדוק תקציב ואזור מועדף.</p></div>)}</section>}
      {section === 'deals' && <section>{properties.slice(0, 3).map((property, index) => <div key={property.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"><div><h3 className="font-semibold">{property.city} · {property.rooms} חדרים</h3><p className="text-sm text-muted-foreground">{['ביקור בנכס', 'משא ומתן', 'הושלם בהדגמה'][index]}</p></div><p>{money(property.rewards[3])} תגמול מדומה</p></div>)}</section>}
      {section === 'wallet' && <section className="space-y-4"><h3 className="text-lg font-semibold">יתרה בהדגמה: 1,240 קרדיטים</h3><p className="text-2xl font-bold text-success">{money(12400 + tick * 6)} תגמולים מדומים</p>{['תגמול עבור פנייה מסוננת', 'תגמול עבור שיחת התאמה', 'תגמול סגירה לדוגמה'].map((label, index) => <div key={label} className="flex justify-between border-b border-border py-4"><p>{label}</p><p>{money([75, 120, 6000][index])}</p></div>)}</section>}
      {section === 'connections' && <section>{['Facebook · קבוצות ודף עסקי', 'WhatsApp הרשמי', 'מייל', 'לוח שנה'].map(label => <div key={label} className="flex justify-between border-b border-border py-4"><p>{label}</p><span className="text-success">מחובר בהדגמה</span></div>)}</section>}
      {section === 'profile' && <section className="space-y-3"><h3 className="text-lg font-semibold">חשבון הדגמה · {DEMO_TYPES.find(item => item.id === role)?.label}</h3><p>שם: משתמש לדוגמה</p><p>אזור פעילות: המרכז והשרון</p><p>מצב: צפייה וסימולציה בלבד</p></section>}
    </>}
  </main></PublicProfileShell>;
}