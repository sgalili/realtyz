import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Eye, Loader2 } from 'lucide-react';
import { DEMO_TYPES, isDemoType, type DemoType } from './demoData';
import { useAuth } from '@/hooks/useAuth';
import { DEMO_HOME, startDemoSession } from '@/lib/demoView';
import { useDemoViewType } from '@/components/demo/DemoViewBar';

function CtaBanner() {
  return (
    <div className="rounded-xl bg-primary text-primary-foreground p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="font-semibold text-center sm:text-right">אהבת את מה שאתה רואה? צא ממצב דמו ועבור לחשבון לייב מאומת</p>
      <Button asChild variant="secondary"><Link to="/auth">הצטרפות בחינם</Link></Button>
    </div>
  );
}

function DemoRoleSelection() {
  return <div dir="rtl" className="min-h-screen bg-background text-foreground">
    <main data-no-hero-wave className="mx-auto max-w-4xl space-y-6 p-4 py-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" />מצב דמו לצפייה בלבד · ללא הרשמה או קוד אימות</div>
      <header className="space-y-2"><h1 className="text-2xl font-bold sm:text-3xl">איזה חשבון תרצה לראות?</h1><p className="text-muted-foreground">בחר את סוג המשתמש שלך ותעבור מיד להדגמה המותאמת לך.</p></header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{DEMO_TYPES.map(t => <Link key={t.id} to={`/demo/${t.id}`} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-accent" aria-label={`צפייה בדמו: ${t.label}`}>
        <span className="block text-lg font-semibold">{t.label}</span><span className="mt-2 flex items-center gap-1 text-sm text-primary">צפייה בהדגמה<Eye className="h-4 w-4" /></span>
      </Link>)}</div>
      <CtaBanner />
    </main>
  </div>;
}


/** Opens the real app screens signed in as the view-only demo account of this type. */
function DemoLauncher({ type }: { type: DemoType }) {
  const { user, loading } = useAuth();
  const current = useDemoViewType();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const started = useRef(false);
  const realUser = !!user && !current;

  useEffect(() => {
    if (loading || started.current) return;
    if (user && current === type) { navigate(DEMO_HOME[type], { replace: true }); return; }
    if (realUser && !confirmed) return;
    started.current = true;
    startDemoSession(type).then(() => navigate(DEMO_HOME[type], { replace: true }), (e) => { started.current = false; setError(e instanceof Error ? e.message : 'לא ניתן לפתוח את הדמו'); });
  }, [loading, user, current, type, confirmed, realUser, navigate]);

  const label = DEMO_TYPES.find((t) => t.id === type)?.label;
  return <div dir="rtl" className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
    <div className="max-w-md w-full space-y-4 rounded-xl border border-border bg-card p-6 text-center">
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" />מצב דמו לצפייה בלבד</div>
      <h1 className="text-xl font-bold">דמו: {label}</h1>
      {error ? <><p className="text-destructive">{error}</p><Button onClick={() => { setError(null); setConfirmed(true); started.current = false; }}>נסו שוב</Button></>
        : realUser && !confirmed ? <><p>כניסה לדמו תנתק אותך מהחשבון הנוכחי. אפשר לחזור אליו בכניסה רגילה.</p><div className="flex justify-between gap-2"><Button variant="outline" onClick={() => navigate(-1)}>ביטול</Button><Button onClick={() => setConfirmed(true)}>כניסה לדמו</Button></div></>
        : <p className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />פותחים את החשבון לצפייה...</p>}
    </div>
  </div>;
}

export default function DemoPage() {
  const { type } = useParams();
  if (!type) return <DemoRoleSelection />;
  if (!isDemoType(type)) return <Navigate to="/demo" replace />;
  return <DemoLauncher type={type} />;
}
